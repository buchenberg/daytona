// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"strings"
)

// splitDomainAllowList parses a comma-separated domain allow list into a slice
// of trimmed, non-empty domains.
func splitDomainAllowList(domainAllowList string) []string {
	parts := strings.Split(domainAllowList, ",")
	domains := make([]string, 0, len(parts))
	for _, p := range parts {
		if p = strings.TrimSpace(p); p != "" {
			domains = append(domains, p)
		}
	}
	return domains
}

// applyDomainAllowList configures (or clears) the netleash domain allow list for
// a container's egress. It is keyed by the full container ID, which is stable
// across stop/start and available at every lifecycle call site. A blank/empty
// list clears any existing restriction (unrestricted egress). No-op when
// netleash is disabled.
//
// This resolves the container cgroup and programs eBPF, which can take a moment,
// so callers should invoke it from a goroutine to avoid blocking the lifecycle
// path (mirroring how network rules are applied).
func (d *DockerClient) applyDomainAllowList(ctx context.Context, containerId, domainAllowList string) {
	if d.netleashManager == nil {
		return
	}

	domains := splitDomainAllowList(domainAllowList)
	if len(domains) == 0 {
		d.netleashManager.Remove(containerId)
		return
	}

	cgroupPath, err := d.resolveContainerCgroup(ctx, containerId)
	if err != nil {
		d.logger.ErrorContext(ctx, "Failed to resolve container cgroup for netleash", "containerId", containerId, "error", err)
		return
	}

	if err := d.netleashManager.Configure(containerId, cgroupPath, domains); err != nil {
		d.logger.ErrorContext(ctx, "Failed to apply domain allow list", "containerId", containerId, "error", err)
	}
}
