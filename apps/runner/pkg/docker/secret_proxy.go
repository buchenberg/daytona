// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

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
	"github.com/daytonaio/daytona/libs/netleash/pkg/secrets"
	"github.com/daytonaio/runner/cmd/runner/config"
	"github.com/docker/docker/api/types/container"
	"github.com/docker/docker/api/types/network"
)

// secretCAContainerPath is where the shared proxy's CA bundle is mounted inside
// every secret-using sandbox; the injected SSL_CERT_FILE / *_CA_BUNDLE env vars
// point HTTP clients at it so they trust the proxy's MITM certificates.
const secretCAContainerPath = "/etc/daytona/netleash/ca.crt"

// EnableSecretInjection brings up the runner's shared secret-injection proxy:
// it resolves the sandbox bridge gateway, starts the netleash shared MITM proxy
// bound to "<gateway>:<port>", and records the proxy address and CA bundle path
// so they can be injected into secret-using sandboxes. Idempotent and a no-op
// when secret injection is disabled. Failures are returned but are non-fatal to
// the runner — the caller logs and continues without secret injection.
func (d *DockerClient) EnableSecretInjection(ctx context.Context) error {
	if !d.secretProxyEnabled || d.netleashManager == nil {
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

	handle, err := d.netleashManager.EnableSecretInjection(manager.SecretInjectionConfig{
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
		d.logger.ErrorContext(ctx, "Secret injection proxy enabled with partial failures", "error", err)
	}
	d.logger.InfoContext(ctx, "Secret injection proxy enabled", "addr", handle.Addr, "gateway", gatewayIP)
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
	if n := config.GetContainerNetwork(); n != "" {
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
// Daytona secret placeholder — the signal that the sandbox needs the secret
// proxy wired in (HTTP(S)_PROXY + CA) and a per-sandbox binding registered.
func sandboxUsesSecrets(env map[string]string) bool {
	for _, v := range env {
		if strings.HasPrefix(v, secrets.DaytonaPlaceholderPrefix) {
			return true
		}
	}
	return false
}

// secretProxyEnvVars returns the env vars that route a sandbox's HTTP(S) traffic
// through the shared proxy and trust its CA. Empty when secret injection is off
// or the sandbox uses no secrets, so non-secret sandboxes are untouched.
func (d *DockerClient) secretProxyEnvVars(env map[string]string) []string {
	if d.secretProxyAddr == "" || !sandboxUsesSecrets(env) {
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
		"SSL_CERT_FILE=" + secretCAContainerPath,
		"NODE_EXTRA_CA_CERTS=" + secretCAContainerPath,
		"REQUESTS_CA_BUNDLE=" + secretCAContainerPath,
		"CURL_CA_BUNDLE=" + secretCAContainerPath,
	}
}

// secretProxyCABind returns the bind mount (host CA bundle → in-container path,
// read-only) for a secret-using sandbox, or "" when not applicable.
func (d *DockerClient) secretProxyCABind(env map[string]string) string {
	if d.secretProxyCACert == "" || !sandboxUsesSecrets(env) {
		return ""
	}
	return fmt.Sprintf("%s:%s:ro", d.secretProxyCACert, secretCAContainerPath)
}

// persistedSecretBinding is the durable record of a sandbox's secret binding,
// written when the binding is registered. It lets the runner re-register
// bindings after a restart (the in-memory registry is lost, but the proxy
// address and CA are stable) — the sandbox secrets token isn't otherwise
// recoverable from a running container.
type persistedSecretBinding struct {
	SandboxID    string   `json:"sandboxId"`
	SecretsToken string   `json:"secretsToken"`
	AllowAll     bool     `json:"allowAll"`
	Domains      []string `json:"domains,omitempty"`
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

// registerSandboxSecrets registers (and persists) the shared-proxy binding for a
// secret-using sandbox: it maps the container's IP to a resolver that fetches the
// sandbox's secrets from the API authenticating as that sandbox. No-op when
// secret injection is off or the sandbox uses no secrets. containerID is the full
// Docker ID (the manager workload key, matching Remove); sandboxID is used for
// the API call. domainAllowList empty means unrestricted egress (allow-all).
func (d *DockerClient) registerSandboxSecrets(ctx context.Context, containerID, sandboxID string, secretsToken *string, containerIP, domainAllowList string, env map[string]string) {
	if d.secretProxyAddr == "" || !sandboxUsesSecrets(env) {
		return
	}
	if secretsToken == nil || *secretsToken == "" {
		d.logger.WarnContext(ctx, "Sandbox uses secrets but has no secrets token; skipping secret injection", "sandboxId", sandboxID)
		return
	}
	if containerIP == "" {
		d.logger.WarnContext(ctx, "Sandbox uses secrets but has no IP; skipping secret injection", "sandboxId", sandboxID)
		return
	}

	domains := splitDomainAllowList(domainAllowList)
	allowAll := len(domains) == 0

	if err := d.persistSecretBinding(containerID, persistedSecretBinding{
		SandboxID:    sandboxID,
		SecretsToken: *secretsToken,
		AllowAll:     allowAll,
		Domains:      domains,
	}); err != nil {
		d.logger.WarnContext(ctx, "Failed to persist secret binding (won't survive runner restart)", "sandboxId", sandboxID, "error", err)
	}

	if err := d.netleashManager.RegisterSandboxSecrets(containerID, manager.SandboxSecretConfig{
		ClientIP:          containerIP,
		AllowAll:          allowAll,
		AllowedDomains:    domains,
		Resolver:          secrets.NewAPIResolver(d.daytonaApiUrl, sandboxID, *secretsToken),
		PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
	}); err != nil {
		d.logger.ErrorContext(ctx, "Failed to register sandbox secrets", "sandboxId", sandboxID, "error", err)
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

// StartSecretReconcile re-registers persisted secret bindings on startup and
// then periodically, and tears down bindings whose container is gone. This is
// what makes secret injection survive a runner restart: the shared proxy
// re-binds its fixed address and reloads its persisted CA, while this restores
// the per-sandbox bindings the in-memory registry lost. No-op when disabled.
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
			d.netleashManager.UnregisterSandboxSecrets(containerID)
			d.removeSecretBindingFile(containerID)
			continue
		}
		if d.netleashManager.HasSandboxSecrets(containerID) {
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

		if err := d.netleashManager.RegisterSandboxSecrets(containerID, manager.SandboxSecretConfig{
			ClientIP:          ip,
			AllowAll:          b.AllowAll,
			AllowedDomains:    b.Domains,
			Resolver:          secrets.NewAPIResolver(d.daytonaApiUrl, b.SandboxID, b.SecretsToken),
			PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
		}); err != nil {
			d.logger.ErrorContext(ctx, "secret reconcile: failed to re-register binding", "containerId", containerID, "error", err)
			continue
		}
		d.logger.InfoContext(ctx, "secret reconcile: re-registered sandbox secrets", "containerId", containerID, "sandboxId", b.SandboxID)
	}
}

// updateSandboxSecretDomains re-syncs an already-registered sandbox's proxy
// allow list when its domain allow list changes (via UpdateNetworkSettings),
// reusing the persisted auth token. No-op when the sandbox has no secret binding.
func (d *DockerClient) updateSandboxSecretDomains(ctx context.Context, containerID, containerIP, domainAllowList string, env map[string]string) {
	if d.secretProxyAddr == "" || !sandboxUsesSecrets(env) {
		return
	}
	b, err := d.readSecretBinding(containerID)
	if err != nil {
		return // no persisted binding → nothing registered to update
	}
	domains := splitDomainAllowList(domainAllowList)
	b.AllowAll = len(domains) == 0
	b.Domains = domains
	if err := d.persistSecretBinding(containerID, b); err != nil {
		d.logger.WarnContext(ctx, "Failed to persist updated secret binding", "containerId", containerID, "error", err)
	}
	if err := d.netleashManager.RegisterSandboxSecrets(containerID, manager.SandboxSecretConfig{
		ClientIP:          containerIP,
		AllowAll:          b.AllowAll,
		AllowedDomains:    domains,
		Resolver:          secrets.NewAPIResolver(d.daytonaApiUrl, b.SandboxID, b.SecretsToken),
		PlaceholderMarker: secrets.DaytonaPlaceholderPrefix,
	}); err != nil {
		d.logger.ErrorContext(ctx, "Failed to update sandbox secret domains", "containerId", containerID, "error", err)
	}
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
