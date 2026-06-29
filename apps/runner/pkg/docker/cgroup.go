// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"bufio"
	"fmt"
	"os"
	"path/filepath"
	"strconv"
	"strings"

	"github.com/docker/docker/api/types/container"
)

// cgroupV2Mount is the host cgroup v2 mount point.
const cgroupV2Mount = "/sys/fs/cgroup"

// resolveContainerCgroup returns the host cgroup v2 filesystem path for a
// running container, derived from the container's main PID. The runner must be
// able to see container PIDs under /proc (host PID namespace) for this to
// resolve — the same requirement netleash has when attaching to a container.
//
// It takes an already-inspected container so the caller can reuse a single
// inspect for both runtime detection and cgroup resolution.
func resolveContainerCgroup(info *container.InspectResponse) (string, error) {
	if info == nil || info.State == nil || info.State.Pid == 0 {
		return "", fmt.Errorf("container is not running")
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
