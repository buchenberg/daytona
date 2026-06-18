// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

//go:build linux

package docker

import (
	"fmt"
	"log/slog"
	"runtime"

	"github.com/docker/docker/api/types/container"
	"github.com/vishvananda/netlink"
	"github.com/vishvananda/netns"
)

// resolveHostVeth returns the host-side veth interface name for a running
// sandbox container, or "" if it cannot be determined.
//
// Per-sandbox egress rules are anchored on this interface (--physdev-in) rather
// than the source IP. A sandbox runs with CAP_NET_ADMIN (DinD needs it; kata
// guests get CAP ALL), so a root user inside can `ip addr add` a secondary
// in-subnet address to dodge a source-IP match while still being NAT-masqueraded
// out. The host veth, by contrast, lives in the host netns and cannot be renamed
// or moved from inside the sandbox, so it is an unspoofable anchor. This holds
// for both runc/sysbox and kata-clh: in every case Docker wires a veth pair from
// the runner bridge into the sandbox netns.
//
// Resolution failure is logged and returns "" so callers fall back to the
// (weaker) source-IP anchor instead of leaving the sandbox unfiltered.
func resolveHostVeth(log *slog.Logger, c *container.InspectResponse, ip string) string {
	veth, err := containerHostVeth(c, ip)
	if err != nil {
		shortId := ""
		if c != nil && len(c.ID) >= 12 {
			shortId = c.ID[:12]
		}
		if log != nil {
			log.Warn("could not resolve sandbox host veth; egress rules fall back to spoofable source-IP anchor",
				"containerId", shortId, "error", err)
		}
		return ""
	}
	return veth
}

// containerHostVeth resolves the host veth for a running container by reading the
// peer index of the container interface that owns ip (falling back to eth0) from
// inside the container's network namespace, then mapping that index back to a
// name in the host namespace.
func containerHostVeth(c *container.InspectResponse, ip string) (string, error) {
	if c == nil || c.State == nil || c.State.Pid == 0 {
		return "", fmt.Errorf("container is not running")
	}

	// Pin to the OS thread for the duration of the netns switch. Goroutines must
	// not migrate threads while we are in a non-host namespace.
	runtime.LockOSThread()
	defer runtime.UnlockOSThread()

	hostNs, err := netns.Get()
	if err != nil {
		return "", fmt.Errorf("get host netns: %w", err)
	}
	defer hostNs.Close()
	// Best-effort restore even on early return.
	defer func() { _ = netns.Set(hostNs) }()

	contNs, err := netns.GetFromPid(c.State.Pid)
	if err != nil {
		return "", fmt.Errorf("get netns for pid %d: %w", c.State.Pid, err)
	}
	defer contNs.Close()

	if err := netns.Set(contNs); err != nil {
		return "", fmt.Errorf("enter container netns: %w", err)
	}

	peerIndex, err := peerIndexForIP(ip)
	if err != nil {
		return "", err
	}

	// Resolve the peer ifindex to a name back in the host namespace.
	if err := netns.Set(hostNs); err != nil {
		return "", fmt.Errorf("restore host netns: %w", err)
	}

	hostLink, err := netlink.LinkByIndex(peerIndex)
	if err != nil {
		return "", fmt.Errorf("resolve host veth index %d: %w", peerIndex, err)
	}

	return hostLink.Attrs().Name, nil
}

// peerIndexForIP must be called while the current thread is in the container's
// network namespace. It returns the host-side peer ifindex of the interface that
// carries ip; if ip is empty or not found it falls back to eth0.
func peerIndexForIP(ip string) (int, error) {
	links, err := netlink.LinkList()
	if err != nil {
		return 0, fmt.Errorf("list container links: %w", err)
	}

	if ip != "" {
		for _, link := range links {
			addrs, err := netlink.AddrList(link, netlink.FAMILY_V4)
			if err != nil {
				continue
			}
			for _, addr := range addrs {
				if addr.IP != nil && addr.IP.String() == ip {
					if pi := link.Attrs().ParentIndex; pi != 0 {
						return pi, nil
					}
					return 0, fmt.Errorf("interface %s (ip %s) has no peer index", link.Attrs().Name, ip)
				}
			}
		}
	}

	// Fall back to eth0 (the default egress interface for runner-bridge sandboxes;
	// for kata-clh this is the veth peer in the sandbox netns even when the IP is
	// assigned inside the guest VM rather than on eth0 itself).
	eth0, err := netlink.LinkByName("eth0")
	if err != nil {
		return 0, fmt.Errorf("no interface owns ip %q and eth0 lookup failed: %w", ip, err)
	}
	if pi := eth0.Attrs().ParentIndex; pi != 0 {
		return pi, nil
	}
	return 0, fmt.Errorf("eth0 has no peer index")
}
