package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"maps"
	"strings"
	"time"

	"github.com/containerd/errdefs"
	"github.com/daytonaio/common-go/pkg/timer"
	"github.com/daytonaio/runner/pkg/api/dto"
	"github.com/daytonaio/runner/pkg/common"
	"github.com/daytonaio/runner/pkg/models/enums"
	"github.com/docker/docker/api/types/image"
	v1 "github.com/opencontainers/image-spec/specs-go/v1"

	common_errors "github.com/daytonaio/common-go/pkg/errors"
)

func (d *DockerClient) Create(ctx context.Context, sandboxDto dto.CreateSandboxDTO, noSysbox bool, didTryWithoutSysbox bool) (string, string, error) {
	defer timer.Timer()()

	startTime := time.Now()
	defer func() {
		obs, err := common.ContainerOperationDuration.GetMetricWithLabelValues("create")
		if err == nil {
			obs.Observe(time.Since(startTime).Seconds())
		}
	}()

	state, err := d.GetSandboxState(ctx, sandboxDto.Id)
	if err != nil && state == enums.SandboxStateError {
		return "", "", err
	}

	// Reject impossible GPU requests before any snapshot pull or container
	// work; the allocator scan below only decides between possible requests.
	requestedGpu := int(sandboxDto.GpuQuota)
	if requestedGpu > 0 {
		if !d.gpuEnabled {
			return "", "", fmt.Errorf("no free GPU on runner: GPU requested but runner GPU support is disabled")
		}
		if requestedGpu > d.gpuCount {
			return "", "", fmt.Errorf("no free GPU on runner: requested %d GPUs but runner has %d", requestedGpu, d.gpuCount)
		}
	}

	if state == enums.SandboxStatePullingSnapshot {
		ticker := time.NewTicker(time.Second)
		defer ticker.Stop()

		timeout := time.NewTimer(d.snapshotPullTimeout)
		defer func() {
			if !timeout.Stop() {
				select {
				case <-timeout.C:
				default:
				}
			}
		}()

		for state == enums.SandboxStatePullingSnapshot {
			select {
			case <-ctx.Done():
				return "", "", ctx.Err()
			case <-timeout.C:
				return "", "", common_errors.NewRequestTimeoutError(fmt.Errorf("timed out waiting for sandbox %s snapshot pull to complete", sandboxDto.Id))
			case <-ticker.C:
				state, err = d.GetSandboxState(ctx, sandboxDto.Id)
				if err != nil && state == enums.SandboxStateError {
					return "", "", err
				}
			}
		}
	}

	if state == enums.SandboxStateStarted || state == enums.SandboxStateStarting {
		c, err := d.ContainerInspect(ctx, sandboxDto.Id)
		if err != nil {
			return "", "", err
		}

		// Re-assert link-network wiring on retries so idempotent creates still end
		// up with both sandboxes connected to the shared network.
		if _, err := d.reconcileFollowerLinkNetwork(ctx, sandboxDto); err != nil {
			return "", "", err
		}

		containerIP := GetContainerIpAddress(ctx, c)
		if containerIP == "" {
			return "", "", errors.New("sandbox IP not found? Is the sandbox started?")
		}

		// Android-device sandboxes do not run the daytona daemon; their readiness is
		// signaled by the ADB port accepting TCP connections. Match Start's behavior
		// by branching on the inspected container label rather than the DTO.
		if isAndroidDeviceContainer(c) {
			if err := d.waitForAdbRunning(ctx, containerIP); err != nil {
				return "", "", err
			}
			return sandboxDto.Id, "", nil
		}

		daemonVersion, err := d.waitForDaemonRunning(ctx, containerIP, sandboxDto.AuthToken)
		if err != nil {
			return "", "", err
		}

		return sandboxDto.Id, daemonVersion, nil
	}

	if state == enums.SandboxStateStopped || state == enums.SandboxStateCreating {
		// A follower whose first Create attempt crashed between ContainerCreate and
		// NetworkConnect lands here on retry. Reconcile the link network BEFORE Start
		if _, err := d.reconcileFollowerLinkNetwork(ctx, sandboxDto); err != nil {
			return "", "", err
		}

		metadata := maps.Clone(sandboxDto.Metadata)
		if len(sandboxDto.Volumes) > 0 {
			if metadata == nil {
				metadata = make(map[string]string)
			}
			volumesJSON, err := json.Marshal(sandboxDto.Volumes)
			if err == nil {
				metadata["volumes"] = string(volumesJSON)
			}
		}
		// Carry the domain allow list through to Start so resuming a stopped
		// sandbox re-applies the netleash egress filter.
		if sandboxDto.DomainAllowList != nil && *sandboxDto.DomainAllowList != "" {
			if metadata == nil {
				metadata = make(map[string]string)
			}
			metadata["domainAllowList"] = *sandboxDto.DomainAllowList
		}
		_, daemonVersion, err := d.Start(ctx, sandboxDto.Id, sandboxDto.AuthToken, sandboxDto.SecretsToken, metadata)
		if err != nil {
			if isOCIRuntimeCreateError(err) {
				if didTryWithoutSysbox {
					return "", "", err
				}
				// A sysbox daemon outage affects every sandbox on this runner; surface it
				// so the healthcheck cordons the runner (kata stays a last resort for
				// container-specific failures). Scoped to sysbox sandboxes on sysbox
				// runners: a forced-kata sandbox's failure is never a sysbox outage, and
				// non-sysbox runners have no sockets and get no cordon.
				if sandboxDto.Metadata["forceKata"] != "true" && d.SysboxProbesEnabled() && !d.sysboxDaemonsHealthy(ctx) {
					return "", "", err
				}
				// Recreate without sysbox
				if err := d.Destroy(ctx, sandboxDto.Id); err != nil {
					d.logger.WarnContext(ctx, "Failed to destroy sandbox before recreating without sysbox", "sandboxId", sandboxDto.Id, "error", err)
				}
				return d.Create(ctx, sandboxDto, true, true)
			}

			return "", "", err
		}

		return sandboxDto.Id, daemonVersion, nil
	}

	// Validate linked-sandbox preconditions and prep the shared network before we
	// pull the image / create the container, so failures show up early without any
	// wasted work. At this point the follower container does not yet exist, so we
	// only run the owner-side prep — the follower-side attach happens after
	// ContainerCreate below.
	linkedOwnerId, err := d.prepareLinkedSandboxNetwork(ctx, sandboxDto)
	if err != nil {
		return "", "", err
	}

	image, err := d.PullImage(ctx, sandboxDto.Snapshot, sandboxDto.Registry, &sandboxDto.Id)
	if err != nil {
		return "", "", err
	}

	err = d.validateImageArchitecture(image)
	if err != nil {
		d.logger.ErrorContext(ctx, "Failed to validate image architecture", "error", err)
		return "", "", err
	}

	volumeMountPathBinds := make([]string, 0)
	if sandboxDto.Volumes != nil {
		volumeMountPathBinds, err = d.getVolumesMountPathBinds(ctx, sandboxDto.Volumes)
		if err != nil {
			return "", "", err
		}
	}

	// Pin GPU sandboxes to physical cards. The allocator mutex must be held
	// across ContainerCreate so concurrent creators see the new GPU allocation
	// labels on their next scan and skip these indices, but it must NOT be held
	// across the subsequent Start() / network setup which can take seconds.
	var (
		gpuIndices []int
		releaseGpu func()
	)
	if requestedGpu > 0 {
		indices, release, err := d.gpuAllocator.Acquire(ctx, d, requestedGpu)
		if err != nil {
			return "", "", err
		}
		releaseGpu = release
		// Safety net: if anything between here and the explicit release
		// below returns / panics, the mutex still gets released.
		defer func() {
			if releaseGpu != nil {
				releaseGpu()
			}
		}()
		gpuIndices = indices
	}

	containerConfig, hostConfig, networkingConfig, err := d.getContainerConfigs(sandboxDto, image, volumeMountPathBinds, gpuIndices)
	if err != nil {
		return "", "", err
	}

	// Orgs in the API's kata-only list send forceKata=true so the sandbox is always
	// created on the kata-clh runtime, regardless of the configured default runtime.
	forceKata := sandboxDto.Metadata["forceKata"] == "true"

	if noSysbox || forceKata {
		hostConfig.Privileged = false
		hostConfig.Runtime = "kata-clh"
		// The requested limits pass through unchanged: kata enforces them as cgroup
		// limits inside the guest, so the workload gets exactly what was requested.
		// The VM itself is sized at default_vcpus/default_memory + these limits.
		hostConfig.CapAdd = []string{"ALL"}
		hostConfig.SecurityOpt = []string{"seccomp=unconfined", "apparmor=unconfined"}
		// hostConfig.Binds = append(hostConfig.Binds, "/opt/kata/bin/kata-init.sh:/opt/kata-init.sh:ro")
		// containerConfig.Entrypoint = []string{"/opt/kata-init.sh"}
		// containerConfig.Cmd = append([]string{common.DAEMON_PATH}, containerConfig.Cmd...)
	}

	c, err := d.apiClient.ContainerCreate(ctx, containerConfig, hostConfig, networkingConfig, &v1.Platform{
		Architecture: "amd64",
		OS:           "linux",
	}, sandboxDto.Id)
	if err != nil {
		// Container already exists and is being created by another process
		if errdefs.IsConflict(err) {
			return sandboxDto.Id, "", nil
		}
		if !isOCIRuntimeCreateError(err) {
			return "", "", err
		}
	}

	// Container with the GPU allocation labels now exists; concurrent
	// allocator scans will see it, so the mutex can be released even though
	// Start() has not run yet.
	if releaseGpu != nil {
		releaseGpu()
		releaseGpu = nil
	}

	// Attach the follower to the owner's link network before it starts so DNS
	// resolution between the two sandboxes works from the very first boot.
	// Android-device followers are already created directly on the link network
	// (see getContainerNetworkingConfig) so that the link network becomes eth0
	// and docker-android's eth0-bound socat forwarders reach their ADB port; for
	// those we skip the post-create connect — but we still need to clear the
	// bridge port isolation Docker stamps on the freshly-created veth, since
	// connectFollowerToLinkNetwork is what does that for non-android followers.
	if linkedOwnerId != "" {
		if !sandboxDto.IsAndroidSandbox() {
			if err := d.connectFollowerToLinkNetwork(ctx, linkedOwnerId, sandboxDto.Id, sandboxDto.Name); err != nil {
				return "", "", err
			}
		} else {
			d.clearLinkNetworkIsolation(ctx, linkedOwnerId)
		}
	}

	// Skip starting the container if explicitly requested
	if sandboxDto.SkipStart != nil && *sandboxDto.SkipStart {
		return c.ID, "", nil
	}

	runningContainer, daemonVersion, err := d.Start(ctx, sandboxDto.Id, sandboxDto.AuthToken, sandboxDto.SecretsToken, sandboxDto.Metadata)
	if err != nil {
		if isOCIRuntimeCreateError(err) {
			if didTryWithoutSysbox {
				return "", "", err
			}
			// A daemon outage hits every sandbox here; surface it so the healthcheck
			// cordons the runner. Scoped to sysbox sandboxes on sysbox runners (see above).
			if !forceKata && d.SysboxProbesEnabled() && !d.sysboxDaemonsHealthy(ctx) {
				return "", "", err
			}
			// Recreate without sysbox
			if err := d.Destroy(ctx, sandboxDto.Id); err != nil {
				d.logger.WarnContext(ctx, "Failed to destroy sandbox before recreating without sysbox", "sandboxId", sandboxDto.Id, "error", err)
			}
			return d.Create(ctx, sandboxDto, true, true)
		} else {
			return "", "", err
		}
	}

	containerShortId := runningContainer.ID[:12]

	ip := GetContainerIpAddress(ctx, runningContainer)
	veth := resolveHostVeth(d.logger, runningContainer, ip)
	if sandboxDto.NetworkBlockAll != nil && *sandboxDto.NetworkBlockAll {
		go func() {
			err = d.netRulesManager.SetNetworkRules(containerShortId, ip, veth, "")
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to update sandbox network settings", "error", err)
			}
		}()
	} else if sandboxDto.NetworkAllowList != nil && *sandboxDto.NetworkAllowList != "" {
		go func() {
			err = d.netRulesManager.SetNetworkRules(containerShortId, ip, veth, *sandboxDto.NetworkAllowList)
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to update sandbox network settings", "error", err)
			}
		}()
	}

	if sandboxDto.Metadata != nil && sandboxDto.Metadata["limitNetworkEgress"] == "true" {
		go func() {
			err = d.netRulesManager.SetNetworkLimiter(containerShortId, ip, veth)
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to update sandbox network settings", "error", err)
			}
		}()
	}

	if sandboxDto.DomainAllowList != nil && *sandboxDto.DomainAllowList != "" {
		go d.applyDomainAllowList(context.Background(), runningContainer.ID, *sandboxDto.DomainAllowList)
	}

	// Register this sandbox's secrets with the shared injection proxy (no-op when
	// it uses none). Keyed by the full container ID, matching the eBPF/lifecycle
	// teardown path. An empty domain allow list means unrestricted egress.
	domainAllowList := ""
	if sandboxDto.DomainAllowList != nil {
		domainAllowList = *sandboxDto.DomainAllowList
	}
	d.registerSandboxSecrets(context.Background(), runningContainer.ID, sandboxDto.Id, sandboxDto.SecretsToken, ip, domainAllowList, sandboxDto.Env)

	return c.ID, daemonVersion, nil
}

func (p *DockerClient) validateImageArchitecture(image *image.InspectResponse) error {
	defer timer.Timer()()

	if image == nil {
		return fmt.Errorf("image not found")
	}

	arch := strings.ToLower(image.Architecture)
	validArchs := []string{"amd64", "x86_64"}

	for _, validArch := range validArchs {
		if arch == validArch {
			return nil
		}
	}

	return common_errors.NewConflictError(fmt.Errorf("image %s architecture (%s) is not x64 compatible", image.ID, image.Architecture))
}
