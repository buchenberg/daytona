// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"slices"
	"time"

	"github.com/daytonaio/common-go/pkg/timer"
	"github.com/daytonaio/runner/pkg/api/dto"
	"github.com/daytonaio/runner/pkg/common"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/strslice"
	v1 "github.com/opencontainers/image-spec/specs-go/v1"
)

func (d *DockerClient) Start(ctx context.Context, containerId string, authToken *string, metadata map[string]string) (*container.InspectResponse, string, error) {
	defer timer.Timer()()

	// Cancel a backup if it's already in progress
	backup_context, ok := backup_context_map.Get(containerId)
	if ok {
		backup_context.cancel()
	}

	c, err := d.ContainerInspect(ctx, containerId)
	if err != nil {
		return nil, "", err
	}

	if c.State.Running {
		containerIP := GetContainerIpAddress(ctx, c)
		if containerIP == "" {
			return nil, "", errors.New("sandbox IP not found? Is the sandbox started?")
		}

		daemonVersion, err := d.waitForDaemonRunning(ctx, containerIP, authToken)
		if err != nil {
			return nil, "", err
		}

		return c, daemonVersion, nil
	}

	// If the container is using runc, swap it for a kata-clh container before starting.
	if c.HostConfig != nil && c.HostConfig.Runtime == "runc" {
		converted, err := d.convertRuncToKata(ctx, containerId, c)
		if err != nil {
			return nil, "", err
		}
		c = converted
	}

	// Re-establish FUSE mounts that may have died since the container was last running.
	if volumesJSON, ok := metadata["volumes"]; ok {
		var volumes []dto.VolumeDTO
		if err := json.Unmarshal([]byte(volumesJSON), &volumes); err == nil && len(volumes) > 0 {
			_, err = d.getVolumesMountPathBinds(ctx, volumes)
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to ensure volume FUSE mounts", "error", err)
			}
		}
	}

	err = d.apiClient.ContainerStart(ctx, containerId, container.StartOptions{})
	if err != nil {
		return nil, "", err
	}

	// make sure container is running
	runningContainer, err := d.waitForContainerRunning(ctx, containerId)
	if err != nil {
		return nil, "", err
	}

	containerIP := GetContainerIpAddress(ctx, runningContainer)
	if containerIP == "" {
		return nil, "", errors.New("sandbox IP not found? Is the sandbox started?")
	}

	if c.HostConfig.Runtime != "kata-clh" && !slices.Equal(c.Config.Entrypoint, strslice.StrSlice{common.DAEMON_PATH}) {
		processesCtx := context.Background()
		go func() {
			if err := d.startDaytonaDaemon(processesCtx, containerId, c.Config.WorkingDir); err != nil {
				d.logger.ErrorContext(ctx, "Failed to start Daytona daemon", "error", err)
			}
		}()
	}

	// If daemon is the sandbox entrypoint (common.DAEMON_PATH), it is started as part of the sandbox;
	// Otherwise, the daemon is started separately above.
	// In either case, we wait for it here.
	daemonVersion, err := d.waitForDaemonRunning(ctx, containerIP, authToken)
	if err != nil {
		return nil, "", err
	}

	if metadata["limitNetworkEgress"] == "true" {
		go func() {
			containerShortId := c.ID[:12]
			err = d.netRulesManager.SetNetworkLimiter(containerShortId, containerIP)
			if err != nil {
				d.logger.ErrorContext(ctx, "Failed to set network limiter", "error", err)
			}
		}()
	}

	return runningContainer, daemonVersion, nil
}

// convertRuncToKata commits the existing runc container to an image, then
// recreates it under the same ID with the kata-clh runtime and the kata-specific
// host config tweaks from create.go. The old runc container is removed and the
// new container's inspect is returned.
func (d *DockerClient) convertRuncToKata(ctx context.Context, containerId string, original *container.InspectResponse) (*container.InspectResponse, error) {
	timestamp := time.Now().Unix()
	imageName := fmt.Sprintf("daytona-runc-to-kata:%s-%d", containerId, timestamp)
	oldName := fmt.Sprintf("%s-runc-%d", containerId, timestamp)

	d.logger.InfoContext(ctx, "Converting runc container to kata-clh", "containerId", containerId, "imageName", imageName)

	if err := d.commitContainer(ctx, containerId, imageName); err != nil {
		return nil, fmt.Errorf("failed to commit runc container: %w", err)
	}

	if err := d.apiClient.ContainerRename(ctx, containerId, oldName); err != nil {
		return nil, fmt.Errorf("failed to rename runc container: %w", err)
	}

	newContainerConfig := *original.Config
	newContainerConfig.Image = imageName

	newHostConfig := *original.HostConfig
	newHostConfig.Privileged = false
	newHostConfig.Runtime = "kata-clh"
	// Kata VM default size is 1vcpu and 2Gi RAM.
	// Kata adds container resources on top of its defaults, so subtract them
	// to get the actual requested size inside the VM.
	if newHostConfig.CPUQuota >= 100000 {
		newHostConfig.CPUQuota -= 100000
	}
	kataDefaultMemory := common.GBToBytes(1)
	if newHostConfig.Memory >= kataDefaultMemory {
		newHostConfig.Memory -= kataDefaultMemory
		newHostConfig.MemorySwap -= kataDefaultMemory
	}
	newHostConfig.CapAdd = []string{"ALL"}
	newHostConfig.SecurityOpt = []string{"seccomp=unconfined", "apparmor=unconfined"}

	networkingConfig := d.getContainerNetworkingConfig()

	if _, err := d.apiClient.ContainerCreate(ctx, &newContainerConfig, &newHostConfig, networkingConfig, &v1.Platform{
		Architecture: "amd64",
		OS:           "linux",
	}, containerId); err != nil {
		if rnErr := d.apiClient.ContainerRename(ctx, oldName, containerId); rnErr != nil {
			d.logger.ErrorContext(ctx, "Failed to roll back rename after kata create failure", "containerId", containerId, "oldName", oldName, "error", rnErr)
		}
		return nil, fmt.Errorf("failed to create kata container: %w", err)
	}

	if err := d.apiClient.ContainerRemove(ctx, oldName, container.RemoveOptions{Force: true}); err != nil {
		d.logger.WarnContext(ctx, "Failed to remove old runc container after kata recreate", "oldName", oldName, "error", err)
	}

	newInspect, err := d.ContainerInspect(ctx, containerId)
	if err != nil {
		return nil, fmt.Errorf("failed to inspect kata container: %w", err)
	}
	return newInspect, nil
}

func (d *DockerClient) waitForContainerRunning(ctx context.Context, containerId string) (*container.InspectResponse, error) {
	defer timer.Timer()()

	timeout := time.Duration(d.sandboxStartTimeoutSec) * time.Second
	timeoutCtx, cancel := context.WithTimeout(ctx, timeout)
	defer cancel()

	ticker := time.NewTicker(10 * time.Millisecond)
	defer ticker.Stop()

	for {
		select {
		case <-timeoutCtx.Done():
			return nil, errors.New("timeout waiting for the sandbox to start - please ensure that your entrypoint is long-running")
		case <-ticker.C:
			c, err := d.ContainerInspect(timeoutCtx, containerId)
			if err != nil {
				return nil, err
			}

			if c.State.Running {
				return c, nil
			}
		}
	}
}
