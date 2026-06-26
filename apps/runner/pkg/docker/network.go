// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package docker

import (
	"context"
	"errors"
	"strings"

	"github.com/daytonaio/runner/pkg/api/dto"
)

func (d *DockerClient) UpdateNetworkSettings(ctx context.Context, containerId string, updateNetworkSettingsDto dto.UpdateNetworkSettingsDTO) error {
	info, err := d.ContainerInspect(ctx, containerId)
	if err != nil {
		return err
	}
	containerShortId := info.ID[:12]

	ipAddress := GetContainerIpAddress(ctx, info)

	// Return error if container does not have an IP address
	if ipAddress == "" {
		return errors.New("sandbox does not have an IP address")
	}

	veth := resolveHostVeth(d.logger, info, ipAddress)

	blockAll := updateNetworkSettingsDto.NetworkBlockAll != nil && *updateNetworkSettingsDto.NetworkBlockAll
	var allowListTrimmed string
	hasAllowList := false
	if updateNetworkSettingsDto.NetworkAllowList != nil {
		allowListTrimmed = strings.TrimSpace(*updateNetworkSettingsDto.NetworkAllowList)
		hasAllowList = allowListTrimmed != ""
	}

	switch {
	case blockAll:
		err = d.netRulesManager.SetNetworkRules(containerShortId, ipAddress, veth, "")
	case hasAllowList:
		err = d.netRulesManager.SetNetworkRules(containerShortId, ipAddress, veth, allowListTrimmed)
	case updateNetworkSettingsDto.NetworkBlockAll != nil && !*updateNetworkSettingsDto.NetworkBlockAll && !hasAllowList:
		// Restore general outbound access (clear Daytona filter rules for this sandbox)
		err = d.netRulesManager.DeleteNetworkRules(containerShortId)
	case updateNetworkSettingsDto.NetworkAllowList != nil && !hasAllowList:
		// Explicit empty allow list: treat as open network
		err = d.netRulesManager.DeleteNetworkRules(containerShortId)
	default:
		// No applicable filter change
		err = nil
	}
	if err != nil {
		return err
	}

	if updateNetworkSettingsDto.NetworkLimitEgress != nil && *updateNetworkSettingsDto.NetworkLimitEgress {
		err = d.netRulesManager.SetNetworkLimiter(containerShortId, ipAddress, veth)
		if err != nil {
			return err
		}
	} else if updateNetworkSettingsDto.NetworkLimitEgress != nil && !*updateNetworkSettingsDto.NetworkLimitEgress {
		err = d.netRulesManager.RemoveNetworkLimiter(containerShortId)
		if err != nil {
			return err
		}
	}

	// Apply (or clear) the eBPF domain allow list via netleash. Keyed by the
	// full container ID so it stays consistent across the sandbox lifecycle.
	// An empty list clears any existing restriction.
	if updateNetworkSettingsDto.DomainAllowList != nil {
		domainAllowList := *updateNetworkSettingsDto.DomainAllowList
		go d.applyDomainAllowList(context.Background(), info.ID, domainAllowList)
		// Keep the shared proxy's per-sandbox allow list in sync with the new
		// domain allow list (no-op when the sandbox uses no secrets).
		d.updateSandboxSecretDomains(ctx, info.ID, ipAddress, domainAllowList, envSliceToMap(info.Config.Env))
	}

	return nil
}
