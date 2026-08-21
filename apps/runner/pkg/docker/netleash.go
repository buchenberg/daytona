package docker

import (
	"context"
	"strings"

	"github.com/docker/docker/api/types/container"
)

// kataRuntime is the Docker runtime name for Kata Containers on Cloud Hypervisor.
// Sandboxes on this runtime execute inside a guest VM (see create.go/start.go).
const kataRuntime = "kata-clh"

// isKataRuntime reports whether the container runs on the kata-clh VM runtime,
// whose workload traffic does not traverse the host cgroup and so cannot be
// filtered by cgroup_skb eBPF.
func isKataRuntime(info *container.InspectResponse) bool {
	return info != nil && info.ContainerJSONBase != nil && info.HostConfig != nil && info.HostConfig.Runtime == kataRuntime
}

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

	info, err := d.ContainerInspect(ctx, containerId)
	if err != nil {
		d.logger.ErrorContext(ctx, "Failed to inspect container for netleash", "containerId", containerId, "error", err)
		return
	}

	env := envSliceToMap(info.Config.Env)

	// Gate web ports through the shared egress proxy so the allow list is enforced
	// on the requested hostname (SNI/Host) rather than on spoofable DNS-learned
	// IPs. In cgroup mode this must NOT hinge on the sandbox carrying the proxy
	// wiring: the eBPF connect4 hook redirects transparently and non-secret hosts
	// are spliced end-to-end (no proxy CA needed), so enforcement works even for an
	// allow list applied after creation (when the wiring could no longer be
	// injected). Requiring the wiring here is exactly what left such sandboxes open
	// to the shared-IP / domain-fronting bypass. See sandboxProxyEnforced for the
	// secret-using exception (MITM'd hosts need the mounted CA).
	enforce := d.sandboxProxyEnforced(env, domainAllowList)

	// kata-clh runs the workload inside a guest VM. Its network traffic never
	// passes through the host cgroup that cgroup_skb eBPF filters — it only
	// crosses the host-side veth — so cgroup-mode filtering is a silent no-op and
	// every domain stays reachable. Attach the firewall in TC/interface mode on
	// that veth instead. runc/sysbox processes live in the host cgroup, so cgroup
	// mode applies to them as before.
	if isKataRuntime(info) {
		// TC/interface mode has no connect4 hook, so the proxy can only be the
		// egress path when the workload honors HTTP(S)_PROXY — i.e. it is wired.
		// Without the wiring, gating web ports would drop all web egress instead of
		// redirecting it, so fall back to the IP allow list (the transparent-redirect
		// hardening is cgroup-only). A wired kata sandbox still enforces normally.
		if enforce && !d.hasProxyWiring(env) {
			enforce = false
			d.logger.WarnContext(ctx, "kata sandbox lacks proxy wiring; web-port gating disabled (hostname enforcement unavailable, IP allow list still applies)", "containerId", containerId)
		}
		ip := GetContainerIpAddress(ctx, info)
		veth := resolveHostVeth(d.logger, info, ip)
		if veth == "" {
			d.logger.ErrorContext(ctx, "Failed to resolve host veth for kata sandbox; domain allow list NOT applied (egress is unfiltered)", "containerId", containerId)
			return
		}
		if err := d.netleashManager.ConfigureInterface(containerId, veth, true, domains, enforce); err != nil {
			d.logger.ErrorContext(ctx, "Failed to apply domain allow list (kata/interface mode)", "containerId", containerId, "veth", veth, "error", err)
		}
		return
	}

	cgroupPath, err := resolveContainerCgroup(info)
	if err != nil {
		d.logger.ErrorContext(ctx, "Failed to resolve container cgroup for netleash", "containerId", containerId, "error", err)
		return
	}

	if err := d.netleashManager.Configure(containerId, cgroupPath, domains, enforce); err != nil {
		d.logger.ErrorContext(ctx, "Failed to apply domain allow list", "containerId", containerId, "error", err)
	}
}
