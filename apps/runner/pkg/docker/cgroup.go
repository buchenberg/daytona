// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"bufio"
	"context"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"
)

// cgroupV2Mount is the host cgroup v2 mount point.
const cgroupV2Mount = "/sys/fs/cgroup"

// resolveContainerCgroup returns the host cgroup v2 filesystem path for a
// running container, derived from the container's main PID. The runner must be
// able to see container PIDs under /proc (host PID namespace) for this to
// resolve — the same requirement netleash has when attaching to a container.
func (d *DockerClient) resolveContainerCgroup(ctx context.Context, containerId string) (string, error) {
	info, err := d.ContainerInspect(ctx, containerId)
	if err != nil {
		return "", err
	}
	if info.State == nil || info.State.Pid == 0 {
		return "", fmt.Errorf("container %s is not running", containerId)
	}

	cgroupFile := filepath.Join("/proc", strconv.Itoa(info.State.Pid), "cgroup")
	f, err := os.Open(cgroupFile)
	if err != nil {
		return "", fmt.Errorf("reading %s: %w", cgroupFile, err)
	}
	defer f.Close()

	scanner := bufio.NewScanner(f)
	for scanner.Scan() {
		// cgroup v2 line format: "0::<path>"
		parts := strings.SplitN(scanner.Text(), ":", 3)
		if len(parts) == 3 && parts[0] == "0" && parts[1] == "" {
			cgPath := filepath.Join(cgroupV2Mount, parts[2])
			if stat, statErr := os.Stat(cgPath); statErr == nil && stat.IsDir() {
				return cgPath, nil
			}
			return "", fmt.Errorf("cgroup path does not exist: %s", cgPath)
		}
	}
	if err := scanner.Err(); err != nil {
		return "", fmt.Errorf("reading %s: %w", cgroupFile, err)
	}
	return "", fmt.Errorf("no cgroup v2 entry found in %s", cgroupFile)
}
