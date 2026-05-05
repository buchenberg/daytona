// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

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

		containerIP := GetContainerIpAddress(ctx, c)
		if containerIP == "" {
			return "", "", errors.New("sandbox IP not found? Is the sandbox started?")
		}

		daemonVersion, err := d.waitForDaemonRunning(ctx, containerIP, sandboxDto.AuthToken)
		if err != nil {
			return "", "", err
		}

		return sandboxDto.Id, daemonVersion, nil
	}

	if state == enums.SandboxStateStopped || state == enums.SandboxStateCreating {
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
		_, daemonVersion, err := d.Start(ctx, sandboxDto.Id, sandboxDto.AuthToken, metadata)
		if err != nil {
			if strings.Contains(err.Error(), "OCI runtime create failed") {
				if didTryWithoutSysbox {
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

	containerConfig, hostConfig, networkingConfig, err := d.getContainerConfigs(sandboxDto, image, volumeMountPathBinds)
	if err != nil {
		return "", "", err
	}

	if noSysbox {
		hostConfig.Privileged = false
		hostConfig.Runtime = "kata-clh"
		// Kata VM default size is 1vcpu and 2Gi RAM
		// Kata adds container resources on top of its defaults, so subtract them
		// to get the actual requested size inside the VM.
		if hostConfig.CPUQuota > 100000 {
			hostConfig.CPUQuota -= 100000 // subtract 1 vCPU (1 * CPUPeriod)
		}
		kataDefaultMemory := common.GBToBytes(2)
		if hostConfig.Memory > kataDefaultMemory {
			hostConfig.Memory -= kataDefaultMemory
			hostConfig.MemorySwap -= kataDefaultMemory
		}

		hostConfig.CapAdd = []string{"ALL"}
		hostConfig.SecurityOpt = []string{"seccomp=unconfined", "apparmor=unconfined"}
		hostConfig.Binds = append(hostConfig.Binds, "/opt/kata/bin/kata-init.sh:/opt/kata-init.sh:ro")
		containerConfig.Entrypoint = []string{"/opt/kata-init.sh"}
		containerConfig.Cmd = append([]string{common.DAEMON_PATH}, containerConfig.Cmd...)
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
		if !strings.Contains(err.Error(), "OCI runtime create failed") {
			return "", "", err
		}
	}

	// Skip starting the container if explicitly requested
	if sandboxDto.SkipStart != nil && *sandboxDto.SkipStart {
		return c.ID, "", nil
	}

	runningContainer, daemonVersion, err := d.Start(ctx, sandboxDto.Id, sandboxDto.AuthToken, sandboxDto.Metadata)
	if err != nil {
		if strings.Contains(err.Error(), "OCI runtime create failed") {
			if didTryWithoutSysbox {
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
	if sandboxDto.NetworkBlockAll != nil && *sandboxDto.NetworkBlockAll {
		go func() {
			err = d.netRulesManager.SetNetworkRules(containerShortId, ip, "")
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to update sandbox network settings", "error", err)
			}
		}()
	} else if sandboxDto.NetworkAllowList != nil && *sandboxDto.NetworkAllowList != "" {
		go func() {
			err = d.netRulesManager.SetNetworkRules(containerShortId, ip, *sandboxDto.NetworkAllowList)
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to update sandbox network settings", "error", err)
			}
		}()
	}

	if sandboxDto.Metadata != nil && sandboxDto.Metadata["limitNetworkEgress"] == "true" {
		go func() {
			err = d.netRulesManager.SetNetworkLimiter(containerShortId, ip)
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to update sandbox network settings", "error", err)
			}
		}()
	}

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
