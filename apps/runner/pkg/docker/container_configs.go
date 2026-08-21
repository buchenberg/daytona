package docker

import (
	"fmt"
	"slices"
	"strconv"
	"strings"

	"github.com/daytonaio/runner/cmd/runner/config"
	"github.com/daytonaio/runner/pkg/api/dto"
	"github.com/daytonaio/runner/pkg/common"
	"github.com/docker/docker/api/types/image"
	"github.com/docker/docker/api/types/network"
	"github.com/docker/docker/api/types/strslice"

	"github.com/docker/docker/api/types/container"
)

// androidDeviceLabel is set on containers created for sandboxes tagged as "android-device".
// The Start path reads it to skip the daytona daemon exec/wait that regular sandboxes need.
const androidDeviceLabel = "daytona.android_device"

// isAndroidDeviceContainer reports whether an already-created container was provisioned for
// an android-device sandbox, based on the label written at create time.
func isAndroidDeviceContainer(c *container.InspectResponse) bool {
	if c == nil || c.Config == nil {
		return false
	}
	return c.Config.Labels[androidDeviceLabel] == "true"
}

func (d *DockerClient) getContainerConfigs(sandboxDto dto.CreateSandboxDTO, image *image.InspectResponse, volumeMountPathBinds []string, gpuIndices []int) (*container.Config, *container.HostConfig, *network.NetworkingConfig, error) {
	containerConfig, err := d.getContainerCreateConfig(sandboxDto, image, gpuIndices)
	if err != nil {
		return nil, nil, nil, err
	}

	hostConfig, err := d.getContainerHostConfig(sandboxDto, volumeMountPathBinds, gpuIndices)
	if err != nil {
		return nil, nil, nil, err
	}

	networkingConfig := d.getContainerNetworkingConfig(sandboxDto)

	return containerConfig, hostConfig, networkingConfig, nil
}

func (d *DockerClient) getContainerCreateConfig(sandboxDto dto.CreateSandboxDTO, image *image.InspectResponse, gpuIndices []int) (*container.Config, error) {
	if image == nil {
		return nil, fmt.Errorf("image not found for sandbox: %s", sandboxDto.Id)
	}

	envVars := []string{
		"DAYTONA_SANDBOX_ID=" + sandboxDto.Id,
		"DAYTONA_SANDBOX_SNAPSHOT=" + sandboxDto.Snapshot,
		"DAYTONA_SANDBOX_USER=" + sandboxDto.OsUser,
	}

	// GPU sandboxes run non-privileged so CDI's per-device cgroup rules take
	// effect. Physical GPU isolation is done entirely by docker-native CDI
	// (HostConfig.DeviceRequests, Driver "cdi"): it injects only the assigned
	// devices and renumbers them to 0..N-1 inside the container. The env vars
	// are not the isolation mechanism:
	//   - NVIDIA_VISIBLE_DEVICES is pinned to "void" - the value the CDI runtime
	//     forces at container start anyway - so a base image's common
	//     NVIDIA_VISIBLE_DEVICES=all default can never become the effective value
	//     and over-expose GPUs if injection ever falls back off the CDI path.
	//   - CUDA_VISIBLE_DEVICES pins the CUDA runtime to the logical 0..N-1 view.
	if len(gpuIndices) > 0 {
		visibleDevices := make([]string, len(gpuIndices))
		for i := range gpuIndices {
			visibleDevices[i] = strconv.Itoa(i)
		}
		visibleDeviceList := strings.Join(visibleDevices, ",")
		envVars = append(envVars,
			"NVIDIA_VISIBLE_DEVICES=void",
			"CUDA_VISIBLE_DEVICES="+visibleDeviceList,
		)
	}

	for key, value := range sandboxDto.Env {
		envVars = append(envVars, fmt.Sprintf("%s=%s", key, value))
	}

	if sandboxDto.OtelEndpoint != nil && *sandboxDto.OtelEndpoint != "" {
		envVars = append(envVars, "DAYTONA_OTEL_ENDPOINT="+*sandboxDto.OtelEndpoint)
	}

	if sandboxDto.OrganizationId != nil && *sandboxDto.OrganizationId != "" {
		envVars = append(envVars, "DAYTONA_ORGANIZATION_ID="+*sandboxDto.OrganizationId)
	}

	if sandboxDto.RegionId != nil && *sandboxDto.RegionId != "" {
		envVars = append(envVars, "DAYTONA_REGION_ID="+*sandboxDto.RegionId)
	}

	// Route the sandbox's HTTP(S) traffic through the shared netleash egress
	// proxy and trust its CA when it uses secrets (placeholders in outbound
	// requests get swapped for real values) or when proxy enforcement is on and
	// it has a domain allow list (the proxy enforces the list on the requested
	// hostname; eBPF gates web ports so it can't be bypassed). No-op otherwise.
	if wiringEnv := d.proxyWiringEnvVars(sandboxDto.Env, derefString(sandboxDto.DomainAllowList)); len(wiringEnv) > 0 {
		envVars = append(envVars, wiringEnv...)
	}

	labels := make(map[string]string)
	if sandboxDto.Name != "" {
		labels[sandboxNameLabel] = sandboxDto.Name
	}
	if len(sandboxDto.Volumes) > 0 {
		volumeMountPaths := make([]string, len(sandboxDto.Volumes))
		for i, v := range sandboxDto.Volumes {
			volumeMountPaths[i] = v.MountPath
		}
		labels["daytona.volume_mount_paths"] = strings.Join(volumeMountPaths, ",")
	}
	if sandboxDto.RegionId != nil && *sandboxDto.RegionId != "" {
		labels["daytona.region_id"] = *sandboxDto.RegionId
	}
	if sandboxDto.Metadata != nil {
		if orgID, ok := sandboxDto.Metadata["organizationId"]; ok && orgID != "" {
			labels["daytona.organization_id"] = orgID
		}
		if orgName, ok := sandboxDto.Metadata["organizationName"]; ok && orgName != "" {
			labels["daytona.organization_name"] = orgName
		}
	}
	if len(gpuIndices) > 0 {
		indexStrings := make([]string, len(gpuIndices))
		for i, index := range gpuIndices {
			indexStrings[i] = strconv.Itoa(index)
		}
		labels[GpuIndexLabel] = strings.Join(indexStrings, ",")
	}

	// Android-device sandboxes run the image's native entrypoint (e.g. the docker-android
	// emulator bootstrap) and never host the daytona daemon. We mark the container with a
	// label so the Start path can detect this later without needing the original DTO.
	if sandboxDto.IsAndroidSandbox() {
		labels[androidDeviceLabel] = "true"
		return &container.Config{
			Hostname:     sandboxDto.Id,
			Image:        sandboxDto.Snapshot,
			Env:          envVars,
			Labels:       labels,
			AttachStdout: true,
			AttachStderr: true,
		}, nil
	}

	workingDir := ""
	cmd := []string{}
	entrypoint := sandboxDto.Entrypoint
	if !d.useSnapshotEntrypoint {
		if image.Config.WorkingDir != "" {
			workingDir = image.Config.WorkingDir
		}

		// If workingDir is empty, append flag env var to envVars
		if workingDir == "" {
			envVars = append(envVars, "DAYTONA_USER_HOME_AS_WORKDIR=true")
		}

		entrypoint = []string{common.DAEMON_PATH}

		if len(sandboxDto.Entrypoint) != 0 {
			cmd = append(cmd, sandboxDto.Entrypoint...)
		} else {
			if slices.Equal(image.Config.Entrypoint, strslice.StrSlice{common.DAEMON_PATH}) {
				cmd = append(cmd, image.Config.Cmd...)
			} else {
				cmd = append(cmd, image.Config.Entrypoint...)
			}
		}
	}

	return &container.Config{
		Hostname:     sandboxDto.Id,
		Image:        sandboxDto.Snapshot,
		WorkingDir:   workingDir,
		Env:          envVars,
		Entrypoint:   entrypoint,
		Cmd:          cmd,
		Labels:       labels,
		AttachStdout: true,
		AttachStderr: true,
	}, nil
}

func (d *DockerClient) getContainerHostConfig(sandboxDto dto.CreateSandboxDTO, volumeMountPathBinds []string, gpuIndices []int) (*container.HostConfig, error) {
	// Android-device sandboxes run on plain docker runtime, without the bundled
	// daytona daemon, and require /dev/kvm to be mounted for emulator acceleration.
	if sandboxDto.IsAndroidSandbox() {
		return d.getAndroidDeviceHostConfig(sandboxDto, volumeMountPathBinds), nil
	}

	var binds []string

	binds = append(binds, fmt.Sprintf("%s:%s:ro", d.daemonPath, common.DAEMON_PATH))

	// Mount the plugin if available
	if d.computerUsePluginPath != "" {
		binds = append(binds, fmt.Sprintf("%s:/usr/local/lib/daytona-computer-use:ro", d.computerUsePluginPath))
	}

	if len(volumeMountPathBinds) > 0 {
		binds = append(binds, volumeMountPathBinds...)
	}

	// Mount the shared proxy's CA bundle into proxy-wired sandboxes so the
	// injected *_CA_BUNDLE / SSL_CERT_FILE env vars resolve to it.
	if bind := d.proxyCABind(sandboxDto.Env, derefString(sandboxDto.DomainAllowList)); bind != "" {
		binds = append(binds, bind)
	}

	hostConfig := &container.HostConfig{
		// Privileged mode exposes every /dev/nvidia* node and bypasses the
		// CDI cgroup rules, so GPU sandboxes have to opt out to keep their
		// allocated card isolated. Non-GPU sandboxes still need privileged
		// for their current workloads.
		Privileged: len(gpuIndices) == 0,
		Binds:      binds,
	}

	if sandboxDto.OtelEndpoint != nil && strings.Contains(*sandboxDto.OtelEndpoint, "host.docker.internal") {
		hostConfig.ExtraHosts = []string{
			"host.docker.internal:host-gateway",
		}
	}

	cpuQuota := sandboxDto.CpuQuota
	memoryQuotaGiB := sandboxDto.MemoryQuota
	storageQuotaGiB := sandboxDto.StorageQuota

	if !d.resourceLimitsDisabled {
		hostConfig.Resources = container.Resources{
			CPUPeriod:  100000,
			CPUQuota:   cpuQuota * 100000,
			Memory:     common.GBToBytes(float64(memoryQuotaGiB)),
			MemorySwap: common.GBToBytes(float64(memoryQuotaGiB)),
		}
	}

	containerRuntime := config.GetContainerRuntime()
	if containerRuntime != "" {
		hostConfig.Runtime = containerRuntime
	}

	if !d.resourceLimitsDisabled && d.filesystem == "xfs" {
		hostConfig.StorageOpt = map[string]string{
			"size": fmt.Sprintf("%dG", storageQuotaGiB),
		}
	}

	// GPU workloads need far more shared memory than Docker's 64 MiB default:
	// PyTorch DataLoader workers pass batches to the main process through
	// /dev/shm and SIGBUS when it is too small. Size it to half the sandbox's
	// memory. This is a ceiling, not a reservation - tmpfs pages are charged to
	// the container's memory cgroup, so the workload still gets the other half.
	if len(gpuIndices) > 0 && memoryQuotaGiB > 0 {
		hostConfig.ShmSize = common.GBToBytes(float64(memoryQuotaGiB)) / 2
	}

	if d.gpuEnabled && len(gpuIndices) > 0 {
		deviceIDs := make([]string, len(gpuIndices))
		for i, index := range gpuIndices {
			deviceIDs[i] = fmt.Sprintf("nvidia.com/gpu=%d", index)
		}
		hostConfig.DeviceRequests = []container.DeviceRequest{{
			Driver:    "cdi",
			DeviceIDs: deviceIDs,
		}}
	}

	return hostConfig, nil
}

func (d *DockerClient) getContainerNetworkingConfig(sandboxDto dto.CreateSandboxDTO) *network.NetworkingConfig {
	// Android-device followers attach directly to the owner's link network at create
	// time (skipping the default bridge / runner-bridge) so the link network becomes
	// eth0 inside the container. This is required for the docker-android entrypoint,
	// which binds its ADB/emulator forwarders to eth0's IP only.
	if sandboxDto.IsAndroidSandbox() && sandboxDto.LinkedSandboxId != nil && *sandboxDto.LinkedSandboxId != "" {
		aliases := []string{}
		if sandboxDto.Name != "" && sandboxDto.Name != sandboxDto.Id {
			aliases = append(aliases, sandboxDto.Name)
		}
		return &network.NetworkingConfig{
			EndpointsConfig: map[string]*network.EndpointSettings{
				linkNetworkName(*sandboxDto.LinkedSandboxId): {Aliases: aliases},
			},
		}
	}

	// Collect every named network the container should be wired to at create
	// time, then wrap the result. Two operator-controlled sources contribute an
	// endpoint: an explicitly configured network (CONTAINER_NETWORK), and the
	// runner bridge that is forced on whenever inter-sandbox networking is off.
	endpoints := make(map[string]*network.EndpointSettings)

	if name := d.containerNetwork; name != "" {
		endpoints[name] = &network.EndpointSettings{}
	}

	if !d.interSandboxNetworkEnabled {
		endpoints[RUNNER_BRIDGE_NETWORK_NAME] = &network.EndpointSettings{}
	}

	// Leave the networking config unset when nothing applies so Docker falls back
	// to its default bridge, matching the prior behaviour.
	if len(endpoints) == 0 {
		return nil
	}

	return &network.NetworkingConfig{EndpointsConfig: endpoints}
}

func (d *DockerClient) getAndroidDeviceHostConfig(sandboxDto dto.CreateSandboxDTO, volumeMountPathBinds []string) *container.HostConfig {
	hostConfig := &container.HostConfig{
		Privileged: false,
		Binds:      append([]string{}, volumeMountPathBinds...),
	}

	if sandboxDto.OtelEndpoint != nil && strings.Contains(*sandboxDto.OtelEndpoint, "host.docker.internal") {
		hostConfig.ExtraHosts = []string{
			"host.docker.internal:host-gateway",
		}
	}

	if !d.resourceLimitsDisabled {
		hostConfig.Resources = container.Resources{
			CPUPeriod:  100000,
			CPUQuota:   sandboxDto.CpuQuota * 100000,
			Memory:     common.GBToBytes(float64(sandboxDto.MemoryQuota)),
			MemorySwap: common.GBToBytes(float64(sandboxDto.MemoryQuota)),
		}
	}

	if d.mountKvmToAndroidSandbox {
		hostConfig.Devices = append(hostConfig.Devices, container.DeviceMapping{
			PathOnHost:        "/dev/kvm",
			PathInContainer:   "/dev/kvm",
			CgroupPermissions: "rwm",
		})
	}

	if !d.resourceLimitsDisabled && d.filesystem == "xfs" {
		hostConfig.StorageOpt = map[string]string{
			"size": fmt.Sprintf("%dG", sandboxDto.StorageQuota),
		}
	}

	// Android-device follower containers pin the link network as their only (and
	// therefore primary / eth0) network. The docker-android entrypoint binds its
	// ADB and emulator-console socat forwarders to eth0's IP; anchoring eth0 to
	// the link network is what makes owner→follower connections work.
	if sandboxDto.LinkedSandboxId != nil && *sandboxDto.LinkedSandboxId != "" {
		hostConfig.NetworkMode = container.NetworkMode(linkNetworkName(*sandboxDto.LinkedSandboxId))
	}

	// Android-device sandboxes always use the stock docker runtime which is able to access /dev/kvm
	hostConfig.Runtime = ""

	return hostConfig
}
