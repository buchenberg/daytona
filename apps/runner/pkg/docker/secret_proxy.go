package docker

import (
	"context"
	"encoding/json"
	"fmt"
	"net"
	"os"
	"path/filepath"
	"strings"
	"time"

	"github.com/daytonaio/daytona/libs/netleash/pkg/manager"
	"github.com/daytonaio/daytona/libs/netleash/pkg/proxy"
	"github.com/daytonaio/daytona/libs/netleash/pkg/secrets"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
)

// secretCAContainerPath is where the shared proxy's CA bundle is mounted inside
// every secret-using sandbox; the injected SSL_CERT_FILE / *_CA_BUNDLE env vars
// point HTTP clients at it so they trust the proxy's MITM certificates. The
// in-sandbox daemon also installs it into the system trust store at startup
// (apps/daemon/pkg/cacert) for clients that ignore those env vars, e.g. GnuTLS
// builds of wget. Keep the path in sync with cacert.DefaultProxyCAPath.
const secretCAContainerPath = "/etc/daytona/netleash/ca.crt"

// EnableEgressProxy brings up the runner's shared egress proxy — the
// hostname-aware MITM proxy that injects secrets and, for proxy-enforced
// sandboxes, is the mandatory path for web-port egress: it resolves the sandbox
// bridge gateway, starts the netleash shared proxy bound to "<gateway>:<port>",
// and records the proxy address and CA bundle path so they can be injected into
// proxy-wired sandboxes. Idempotent and a no-op when neither secret injection
// nor proxy enforcement is enabled. Failures are returned but are non-fatal to
// the runner — the caller logs and continues without the proxy.
func (d *DockerClient) EnableEgressProxy(ctx context.Context) error {
	if !d.egressProxyEnabled || d.netleashManager == nil {
		return nil
	}

	gatewayIP, err := d.resolveSandboxGatewayIP(ctx)
	if err != nil {
		return fmt.Errorf("resolving sandbox bridge gateway: %w", err)
	}

	port := d.secretProxyPort
	if port == 0 {
		port = 18080
	}
	caDir := d.secretCADir
	if caDir == "" {
		caDir = "/var/lib/netleash"
	}

	handle, err := d.netleashManager.EnableEgressProxy(manager.EgressProxyConfig{
		ListenAddr: net.JoinHostPort(gatewayIP, fmt.Sprintf("%d", port)),
		CACertPath: filepath.Join(caDir, "secret-ca.crt"),
		CAKeyPath:  filepath.Join(caDir, "secret-ca.key"),
		// Co-locate the mounted CA bundle with the daemon binary: that directory
		// is already bind-mounted into sandboxes, so the same host path resolves
		// for the mount (a temp/CA-dir path may not be visible to the Docker
		// daemon when the runner itself runs in a container).
		CABundlePath: d.secretCABundleHostPath(),
	})
	if handle == nil {
		// The proxy failed to start at all — secret injection stays off.
		return err
	}

	// The proxy is up; record it so sandboxes get wired to it. A non-nil err here
	// is a partial failure (some already-managed workloads' egress filters could
	// not be updated to allow the proxy); log it loudly but keep going — injection
	// works for every other workload and the affected ones recover when their
	// network settings next change. Returning nil lets the caller start the
	// reconcile loop.
	d.secretProxyAddr = handle.Addr
	d.secretProxyCACert = handle.CACertFile
	if err != nil {
		d.logger.ErrorContext(ctx, "Egress proxy enabled with partial failures", "error", err)
	}
	d.logger.InfoContext(ctx, "Egress proxy enabled", "addr", handle.Addr, "gateway", gatewayIP,
		"secretInjection", d.secretProxyEnabled, "proxyEnforcement", d.proxyEnforcementEnabled)
	return nil
}

// secretCABundleHostPath returns the host path where the combined CA bundle is
// written for mounting into sandboxes. It is placed next to the daemon binary
// (already proven bind-mountable into sandboxes) so the same host path resolves
// for the bind mount even when the runner itself runs in a container; it falls
// back to the CA dir if the daemon binary path is unknown.
func (d *DockerClient) secretCABundleHostPath() string {
	if d.daemonPath != "" {
		return filepath.Join(filepath.Dir(d.daemonPath), "netleash-secret-ca.crt")
	}
	caDir := d.secretCADir
	if caDir == "" {
		caDir = "/var/lib/netleash"
	}
	return filepath.Join(caDir, "secret-ca-bundle.crt")
}

// sandboxNetworkName returns the Docker network sandboxes primarily egress
// through — the same one GetContainerIpAddress reports an IP from — so the
// shared proxy binds to that network's gateway.
func (d *DockerClient) sandboxNetworkName() string {
	if !d.interSandboxNetworkEnabled {
		return RUNNER_BRIDGE_NETWORK_NAME
	}
	if n := d.containerNetwork; n != "" {
		return n
	}
	return "bridge"
}

// resolveSandboxGatewayIP returns the IPv4 gateway of the sandbox network. The
// proxy binds here (a host-side bridge address) and the eBPF firewall allows it,
// so a sandbox reaches the proxy at its default-route gateway.
func (d *DockerClient) resolveSandboxGatewayIP(ctx context.Context) (string, error) {
	name := d.sandboxNetworkName()
	net, err := d.apiClient.NetworkInspect(ctx, name, network.InspectOptions{})
	if err != nil {
		return "", fmt.Errorf("inspecting network %q: %w", name, err)
	}
	for _, cfg := range net.IPAM.Config {
		if cfg.Gateway != "" && isIPv4(cfg.Gateway) {
			return cfg.Gateway, nil
		}
	}
	// Docker usually reports the gateway, but if IPAM only carries the subnet,
	// fall back to its first host address (the conventional bridge gateway).
	for _, cfg := range net.IPAM.Config {
		if cfg.Subnet != "" {
			if gw := firstHostIP(cfg.Subnet); gw != "" {
				return gw, nil
			}
		}
	}
	return "", fmt.Errorf("network %q has no IPv4 gateway/subnet", name)
}

func isIPv4(s string) bool {
	ip := net.ParseIP(s)
	return ip != nil && ip.To4() != nil
}

// firstHostIP returns the first usable host address of an IPv4 CIDR (e.g.
// "172.20.0.0/16" → "172.20.0.1"), which Docker uses as the bridge gateway.
func firstHostIP(cidr string) string {
	ip, _, err := net.ParseCIDR(cidr)
	if err != nil {
		return ""
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return ""
	}
	host := make(net.IP, len(ip4))
	copy(host, ip4)
	host[3]++
	return host.String()
}

// sandboxUsesSecrets reports whether any of the sandbox's env values is a
// Daytona secret placeholder — the signal that the sandbox needs the egress
// proxy wired in (HTTP(S)_PROXY + CA) and a per-sandbox binding registered.
func sandboxUsesSecrets(env map[string]string) bool {
	for _, v := range env {
		if strings.HasPrefix(v, secrets.DaytonaPlaceholderPrefix) {
			return true
		}
	}
	return false
}

// sandboxNeedsProxyWiring reports whether a sandbox must be wired through the
// shared egress proxy (HTTP(S)_PROXY env + trusted CA): it uses secrets, or
// proxy enforcement is on and it has a domain allow list — in which case the
// proxy is the mandatory path for its web traffic and enforces the allow list
// on the requested hostname.
func (d *DockerClient) sandboxNeedsProxyWiring(env map[string]string, domainAllowList string) bool {
	if sandboxUsesSecrets(env) {
		return true
	}
	return d.proxyEnforcementEnabled && len(splitDomainAllowList(domainAllowList)) > 0
}

// sandboxProxyEnforced reports whether a sandbox's web-port egress must be gated
// through the shared proxy (hostname-level allow-list enforcement) — i.e. the
// eBPF connect4 hook should transparently redirect its TCP 80/443 to the proxy,
// which enforces the allow list on the requested SNI/Host.
//
// Crucially this does NOT require the sandbox to carry the proxy wiring
// (HTTP(S)_PROXY env + mounted CA): connect4 redirects transparently without the
// workload's cooperation, and connections to allowed hosts with no secret are
// spliced end-to-end (the client validates the real server certificate, so no
// proxy CA is needed). This lets enforcement also cover a sandbox whose domain
// allow list was applied AFTER creation — when the wiring can no longer be
// injected — which would otherwise be left on the spoofable IP-based allow list:
// a sandbox that resolved an allowed domain on a shared CDN IP could reach any
// co-hosted domain by dialing that IP with a forged Host/SNI.
//
// A secret-using sandbox is the one exception: its secret-injection hosts are
// MITM'd, so it must trust the proxy CA (present only with the wiring) or its TLS
// to those hosts would break. Such sandboxes always receive the wiring at
// creation, so gating them on it costs nothing.
func (d *DockerClient) sandboxProxyEnforced(env map[string]string, domainAllowList string) bool {
	if !d.proxyEnforcementEnabled || d.secretProxyAddr == "" {
		return false
	}
	if len(splitDomainAllowList(domainAllowList)) == 0 {
		return false
	}
	return d.hasProxyWiring(env) || !sandboxUsesSecrets(env)
}

// proxyWiringEnvVars returns the env vars that route a sandbox's HTTP(S)
// traffic through the shared proxy and trust its CA. Empty when the proxy is
// off or the sandbox needs no wiring, so unaffected sandboxes are untouched.
func (d *DockerClient) proxyWiringEnvVars(env map[string]string, domainAllowList string) []string {
	if !d.sandboxNeedsProxyWiring(env, domainAllowList) {
		return nil
	}
	return d.secretProxyWiringEnvVars()
}

// hasProxyWiring reports whether a container's env carries the proxy wiring the
// runner injects (HTTPS_PROXY pointing at the shared proxy). It is the signal
// that eBPF web-port gating is safe to enforce for this container — a sandbox
// created before the proxy existed (or before enforcement was enabled) has no
// wiring, and gating it would break its web egress instead of redirecting it.
func (d *DockerClient) hasProxyWiring(env map[string]string) bool {
	return d.secretProxyAddr != "" && env["HTTPS_PROXY"] == "http://"+d.secretProxyAddr
}

// secretProxyWiringEnvVars returns the wiring env entries injected into
// proxy-wired sandboxes, regardless of whether a particular sandbox needs
// them. Empty when the shared proxy is off.
func (d *DockerClient) secretProxyWiringEnvVars() []string {
	if d.secretProxyAddr == "" {
		return nil
	}
	proxyURL := "http://" + d.secretProxyAddr
	return []string{
		"HTTP_PROXY=" + proxyURL,
		"HTTPS_PROXY=" + proxyURL,
		"http_proxy=" + proxyURL,
		"https_proxy=" + proxyURL,
		// Keep loopback off the proxy so the in-sandbox daemon and local tools
		// aren't routed through it.
		"NO_PROXY=localhost,127.0.0.1,::1",
		"no_proxy=localhost,127.0.0.1,::1",
		// Point common TLS stacks at the proxy CA bundle so MITM'd connections verify.
		// (Connections to hosts with no secret are spliced end-to-end and validate the
		// real server cert, so they don't rely on these — only secret-injection hosts,
		// which the proxy MITMs, do.)
		"SSL_CERT_FILE=" + secretCAContainerPath,
		"NODE_EXTRA_CA_CERTS=" + secretCAContainerPath,
		"REQUESTS_CA_BUNDLE=" + secretCAContainerPath,
		"CURL_CA_BUNDLE=" + secretCAContainerPath,
		// Deno consults neither the system trust store nor the other CA-bundle vars;
		// DENO_CERT is its only env hook for an extra CA (bucket 6).
		"DENO_CERT=" + secretCAContainerPath,
	}
}

// secretProxyWiringEnv is the map form of secretProxyWiringEnvVars, used to
// identify (and strip) previously injected wiring entries when reconciling a
// container's env.
func (d *DockerClient) secretProxyWiringEnv() map[string]string {
	return envSliceToMap(d.secretProxyWiringEnvVars())
}

// proxyCABind returns the bind mount (host CA bundle → in-container path,
// read-only) for a proxy-wired sandbox, or "" when not applicable.
func (d *DockerClient) proxyCABind(env map[string]string, domainAllowList string) string {
	if d.secretProxyCACert == "" || !d.sandboxNeedsProxyWiring(env, domainAllowList) {
		return ""
	}
	return fmt.Sprintf("%s:%s:ro", d.secretProxyCACert, secretCAContainerPath)
}

// persistedSecretBinding is the durable record of a sandbox's proxy policy
// binding, written when the binding is registered. It lets the runner
// re-register bindings after a restart (the in-memory registry is lost, but the
// proxy address and CA are stable) — the sandbox secrets token isn't otherwise
// recoverable from a running container. SecretsToken is empty for
// enforcement-only bindings (domain allow list, no secrets).
type persistedSecretBinding struct {
	SandboxID    string   `json:"sandboxId"`
	SecretsToken string   `json:"secretsToken"`
	AllowAll     bool     `json:"allowAll"`
	Domains      []string `json:"domains,omitempty"`
}

// bindingResolver returns the secret resolver for a persisted binding, or nil
// for an enforcement-only binding (no secrets token).
func (d *DockerClient) bindingResolver(b persistedSecretBinding) proxy.SecretResolver {
	if b.SecretsToken == "" {
		return nil
	}
	return secrets.NewAPIResolver(d.daytonaApiUrl, b.SandboxID, b.SecretsToken)
}

// secretBindingsDir is where per-container binding records live (one JSON file
// per container ID), under the CA dir.
func (d *DockerClient) secretBindingsDir() string {
	caDir := d.secretCADir
	if caDir == "" {
		caDir = "/var/lib/netleash"
	}
	return filepath.Join(caDir, "secret-bindings")
}

// registerSandboxPolicy registers (and persists) the shared-proxy binding for a
// sandbox that is wired through the proxy: its host allow list and — for a
// secret-using sandbox — a resolver that fetches the sandbox's secrets from the
// API authenticating as that sandbox. Sandboxes without secrets get an
// enforcement-only binding when proxy enforcement is on and they have a domain
// allow list (the proxy is their mandatory web-egress path, so it must know
// their policy). No-op when the proxy is off or the sandbox needs no wiring.
// containerID is the full Docker ID (the manager workload key, matching
// Remove); sandboxID is used for the API call. domainAllowList empty means
// unrestricted egress (allow-all).
func (d *DockerClient) registerSandboxPolicy(ctx context.Context, containerID, sandboxID string, secretsToken *string, containerIP, domainAllowList string, env map[string]string) {
	if d.secretProxyAddr == "" || !d.sandboxNeedsProxyWiring(env, domainAllowList) {
		return
	}
	usesSecrets := sandboxUsesSecrets(env)
	if usesSecrets && (secretsToken == nil || *secretsToken == "") {
		d.logger.WarnContext(ctx, "Sandbox uses secrets but has no secrets token; registering policy without secret injection", "sandboxId", sandboxID)
		usesSecrets = false
	}
	if containerIP == "" {
		d.logger.WarnContext(ctx, "Sandbox needs a proxy policy but has no IP; skipping registration", "sandboxId", sandboxID)
		return
	}

	domains := splitDomainAllowList(domainAllowList)
	binding := persistedSecretBinding{
		SandboxID: sandboxID,
		AllowAll:  len(domains) == 0,
		Domains:   domains,
	}
	if usesSecrets {
		binding.SecretsToken = *secretsToken
	}

	if err := d.persistSecretBinding(containerID, binding); err != nil {
		d.logger.WarnContext(ctx, "Failed to persist proxy policy binding (won't survive runner restart)", "sandboxId", sandboxID, "error", err)
	}

	if err := d.netleashManager.RegisterSandboxPolicy(containerID, manager.SandboxPolicyConfig{
		ClientIP:          containerIP,
		AllowAll:          binding.AllowAll,
		AllowedDomains:    domains,
		Resolver:          d.bindingResolver(binding),
		PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
	}); err != nil {
		d.logger.ErrorContext(ctx, "Failed to register sandbox proxy policy", "sandboxId", sandboxID, "error", err)
	}
}

func (d *DockerClient) persistSecretBinding(containerID string, b persistedSecretBinding) error {
	dir := d.secretBindingsDir()
	if err := os.MkdirAll(dir, 0o700); err != nil {
		return err
	}
	data, err := json.Marshal(b)
	if err != nil {
		return err
	}
	return os.WriteFile(filepath.Join(dir, containerID+".json"), data, 0o600)
}

func (d *DockerClient) removeSecretBindingFile(containerID string) {
	_ = os.Remove(filepath.Join(d.secretBindingsDir(), containerID+".json"))
}

// StartSecretReconcile re-registers persisted proxy policy bindings on startup
// and then periodically, and tears down bindings whose container is gone. This
// is what makes secret injection and proxy enforcement survive a runner
// restart: the shared proxy re-binds its fixed address and reloads its
// persisted CA, while this restores the per-sandbox bindings the in-memory
// registry lost. No-op when disabled.
func (d *DockerClient) StartSecretReconcile(ctx context.Context) {
	if d.secretProxyAddr == "" {
		return
	}
	d.ReconcileSecretBindings(ctx)
	go func() {
		ticker := time.NewTicker(time.Minute)
		defer ticker.Stop()
		for {
			select {
			case <-ctx.Done():
				return
			case <-ticker.C:
				d.ReconcileSecretBindings(ctx)
			}
		}
	}()
}

// ReconcileSecretBindings aligns the in-memory secret registry with the
// persisted binding records (the durable source of truth, analogous to the eBPF
// bpffs pins):
//
//   - a record whose container is gone/terminal is dropped (file + registry),
//   - a record whose container is alive but not registered is re-registered
//     using the persisted auth token and the container's current IP.
//
// Idempotent and safe to call repeatedly.
func (d *DockerClient) ReconcileSecretBindings(ctx context.Context) {
	if d.secretProxyAddr == "" {
		return
	}

	dir := d.secretBindingsDir()
	entries, err := os.ReadDir(dir)
	if err != nil {
		if !os.IsNotExist(err) {
			d.logger.ErrorContext(ctx, "secret reconcile: failed to read bindings dir", "error", err)
		}
		return
	}

	containers, err := d.apiClient.ContainerList(ctx, container.ListOptions{All: true})
	if err != nil {
		d.logger.ErrorContext(ctx, "secret reconcile: failed to list containers", "error", err)
		return
	}
	state := make(map[string]string, len(containers))
	for _, c := range containers {
		state[c.ID] = c.State
	}

	for _, e := range entries {
		if e.IsDir() || !strings.HasSuffix(e.Name(), ".json") {
			continue
		}
		containerID := strings.TrimSuffix(e.Name(), ".json")

		st, present := state[containerID]
		if !present || st == "exited" || st == "dead" || st == "removing" {
			d.netleashManager.UnregisterSandboxPolicy(containerID)
			d.removeSecretBindingFile(containerID)
			continue
		}
		if d.netleashManager.HasSandboxPolicy(containerID) {
			continue // already registered
		}

		b, err := d.readSecretBinding(containerID)
		if err != nil {
			d.logger.ErrorContext(ctx, "secret reconcile: failed to read binding; dropping", "containerId", containerID, "error", err)
			d.removeSecretBindingFile(containerID)
			continue
		}

		// Re-inspect for the container's current IP rather than trusting a stale one.
		info, err := d.ContainerInspect(ctx, containerID)
		if err != nil {
			d.logger.ErrorContext(ctx, "secret reconcile: failed to inspect container", "containerId", containerID, "error", err)
			continue
		}
		ip := GetContainerIpAddress(ctx, info)
		if ip == "" {
			continue
		}

		if err := d.netleashManager.RegisterSandboxPolicy(containerID, manager.SandboxPolicyConfig{
			ClientIP:          ip,
			AllowAll:          b.AllowAll,
			AllowedDomains:    b.Domains,
			Resolver:          d.bindingResolver(b),
			PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
		}); err != nil {
			d.logger.ErrorContext(ctx, "secret reconcile: failed to re-register binding", "containerId", containerID, "error", err)
			continue
		}
		d.logger.InfoContext(ctx, "secret reconcile: re-registered sandbox proxy policy", "containerId", containerID, "sandboxId", b.SandboxID)
	}
}

// updateSandboxPolicyDomains re-syncs a sandbox's proxy allow list when its
// domain allow list changes (via UpdateNetworkSettings), reusing any persisted
// auth token. A sandbox routed through the proxy but without a persisted binding
// (e.g. one whose record was lost, or one whose allow list was applied after
// creation) gets a fresh enforcement-only binding, since the proxy is its
// mandatory web-egress path and an unknown client would be rejected. No-op when
// the proxy is off or the sandbox neither carries the wiring nor is transparently
// enforced.
func (d *DockerClient) updateSandboxPolicyDomains(ctx context.Context, containerID, sandboxID, containerIP, domainAllowList string, env map[string]string) {
	// Register the binding whenever the sandbox routes through the proxy: either
	// it carries the proxy wiring (secret-using / explicitly-proxied sandboxes) or
	// its web-port egress is transparently gated through the proxy by eBPF
	// (sandboxProxyEnforced — e.g. an allow list applied after creation). Without
	// the binding the proxy can't map the client IP to an allow list and would
	// reject its redirected traffic, so enforcement without registration would
	// break the sandbox's egress instead of scoping it.
	if d.secretProxyAddr == "" || (!d.hasProxyWiring(env) && !d.sandboxProxyEnforced(env, domainAllowList)) {
		return
	}
	b, err := d.readSecretBinding(containerID)
	if err != nil {
		// No persisted record: the sandbox is wired through the proxy, so it still
		// needs a policy binding for its new allow list (without secrets — the
		// token is not recoverable here).
		b = persistedSecretBinding{SandboxID: sandboxID}
	}
	domains := splitDomainAllowList(domainAllowList)
	b.AllowAll = len(domains) == 0
	b.Domains = domains
	if err := d.persistSecretBinding(containerID, b); err != nil {
		d.logger.WarnContext(ctx, "Failed to persist updated proxy policy binding", "containerId", containerID, "error", err)
	}
	if err := d.netleashManager.RegisterSandboxPolicy(containerID, manager.SandboxPolicyConfig{
		ClientIP:          containerIP,
		AllowAll:          b.AllowAll,
		AllowedDomains:    domains,
		Resolver:          d.bindingResolver(b),
		PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
	}); err != nil {
		d.logger.ErrorContext(ctx, "Failed to update sandbox proxy policy domains", "containerId", containerID, "error", err)
	}
}

// refreshSandboxSecretBinding re-registers an existing policy binding (same IP,
// domains and token) so the shared proxy's injector drops its cached resolution
// and re-fetches the sandbox's secrets immediately. No-op when the proxy is off
// or the sandbox has no persisted binding.
func (d *DockerClient) refreshSandboxSecretBinding(ctx context.Context, containerID, containerIP string) {
	if d.secretProxyAddr == "" {
		return
	}
	b, err := d.readSecretBinding(containerID)
	if err != nil {
		return
	}
	if err := d.netleashManager.RegisterSandboxPolicy(containerID, manager.SandboxPolicyConfig{
		ClientIP:          containerIP,
		AllowAll:          b.AllowAll,
		AllowedDomains:    b.Domains,
		Resolver:          d.bindingResolver(b),
		PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
	}); err != nil {
		d.logger.ErrorContext(ctx, "Failed to refresh sandbox secret binding", "containerId", containerID, "error", err)
	}
}

// derefString returns *s, or "" when s is nil — for optional DTO fields like
// DomainAllowList.
func derefString(s *string) string {
	if s == nil {
		return ""
	}
	return *s
}

// envSliceToMap converts a container's "KEY=VALUE" env slice to a map, for the
// secret-usage check on lifecycle paths that only have the inspected container.
func envSliceToMap(env []string) map[string]string {
	m := make(map[string]string, len(env))
	for _, kv := range env {
		if i := strings.IndexByte(kv, '='); i > 0 {
			m[kv[:i]] = kv[i+1:]
		}
	}
	return m
}

func (d *DockerClient) readSecretBinding(containerID string) (persistedSecretBinding, error) {
	var b persistedSecretBinding
	data, err := os.ReadFile(filepath.Join(d.secretBindingsDir(), containerID+".json"))
	if err != nil {
		return b, err
	}
	err = json.Unmarshal(data, &b)
	return b, err
}
