package docker

import (
	"slices"
	"testing"
)

func TestSandboxUsesSecrets(t *testing.T) {
	if sandboxUsesSecrets(map[string]string{"FOO": "bar", "BAZ": "qux"}) {
		t.Fatal("env with no placeholder should report no secrets")
	}
	if !sandboxUsesSecrets(map[string]string{"ANTHROPIC_API_KEY": "dtn_secret_abc123"}) {
		t.Fatal("env with a placeholder should report secrets")
	}
	if sandboxUsesSecrets(nil) {
		t.Fatal("nil env should report no secrets")
	}
}

func TestFirstHostIP(t *testing.T) {
	cases := map[string]string{
		"172.20.0.0/16":  "172.20.0.1",
		"10.0.0.0/8":     "10.0.0.1",
		"192.168.5.0/24": "192.168.5.1",
		"not-a-cidr":     "",
	}
	for cidr, want := range cases {
		if got := firstHostIP(cidr); got != want {
			t.Errorf("firstHostIP(%q) = %q, want %q", cidr, got, want)
		}
	}
}

func TestEnvSliceToMap(t *testing.T) {
	m := envSliceToMap([]string{"A=1", "B=two=2", "MALFORMED", "=novalue"})
	if m["A"] != "1" {
		t.Errorf("A = %q, want 1", m["A"])
	}
	if m["B"] != "two=2" {
		t.Errorf("B = %q, want two=2", m["B"])
	}
	if _, ok := m["MALFORMED"]; ok {
		t.Error("entry without '=' should be skipped")
	}
	if _, ok := m[""]; ok {
		t.Error("entry with empty key should be skipped")
	}
}

func TestProxyWiringEnvVars(t *testing.T) {
	secretEnv := map[string]string{"KEY": "dtn_secret_x"}
	plainEnv := map[string]string{"KEY": "plain"}

	// Disabled (no proxy address): never injects.
	off := &DockerClient{}
	if off.proxyWiringEnvVars(secretEnv, "") != nil {
		t.Fatal("no env vars expected when the egress proxy is disabled")
	}

	d := &DockerClient{secretProxyAddr: "172.20.0.1:18080"}
	// No secrets in env and no enforcement: no injection (unaffected sandboxes untouched).
	if d.proxyWiringEnvVars(plainEnv, "") != nil {
		t.Fatal("no env vars expected when the sandbox uses no secrets")
	}
	// A domain allow list without enforcement enabled: still untouched.
	if d.proxyWiringEnvVars(plainEnv, "example.com") != nil {
		t.Fatal("no env vars expected when proxy enforcement is disabled")
	}
	got := d.proxyWiringEnvVars(secretEnv, "")
	if !slices.Contains(got, "HTTPS_PROXY=http://172.20.0.1:18080") {
		t.Errorf("expected HTTPS_PROXY in %v", got)
	}
	if !slices.Contains(got, "SSL_CERT_FILE="+secretCAContainerPath) {
		t.Errorf("expected SSL_CERT_FILE in %v", got)
	}
	if !slices.Contains(got, "NO_PROXY=localhost,127.0.0.1,::1") {
		t.Errorf("expected NO_PROXY in %v", got)
	}

	// Proxy enforcement on: an allowlisted sandbox is wired even without secrets.
	enf := &DockerClient{secretProxyAddr: "172.20.0.1:18080", proxyEnforcementEnabled: true}
	got = enf.proxyWiringEnvVars(plainEnv, "example.com, *.github.com")
	if !slices.Contains(got, "HTTPS_PROXY=http://172.20.0.1:18080") {
		t.Errorf("expected HTTPS_PROXY for enforced allowlisted sandbox, got %v", got)
	}
	// ...but a sandbox with neither secrets nor an allow list stays untouched.
	if enf.proxyWiringEnvVars(plainEnv, " ") != nil {
		t.Fatal("no env vars expected for an unrestricted, secret-less sandbox")
	}
}

func TestProxyCABind(t *testing.T) {
	secretEnv := map[string]string{"KEY": "dtn_secret_x"}
	plainEnv := map[string]string{"KEY": "plain"}

	off := &DockerClient{}
	if off.proxyCABind(secretEnv, "") != "" {
		t.Fatal("no bind expected when CA path is unset")
	}

	d := &DockerClient{secretProxyCACert: "/var/lib/netleash/ca.crt"}
	if d.proxyCABind(plainEnv, "") != "" {
		t.Fatal("no bind expected when the sandbox uses no secrets")
	}
	want := "/var/lib/netleash/ca.crt:" + secretCAContainerPath + ":ro"
	if got := d.proxyCABind(secretEnv, ""); got != want {
		t.Errorf("proxyCABind = %q, want %q", got, want)
	}

	// Enforcement wires allowlisted sandboxes without secrets too.
	enf := &DockerClient{secretProxyCACert: "/var/lib/netleash/ca.crt", proxyEnforcementEnabled: true}
	if got := enf.proxyCABind(plainEnv, "example.com"); got != want {
		t.Errorf("proxyCABind (enforced) = %q, want %q", got, want)
	}
}

func TestSandboxProxyEnforced(t *testing.T) {
	const proxyAddr = "172.20.0.1:18080"
	wiredEnv := map[string]string{"HTTPS_PROXY": "http://" + proxyAddr}
	plainEnv := map[string]string{"KEY": "plain"}
	secretEnv := map[string]string{"KEY": "dtn_secret_x"}
	wiredSecretEnv := map[string]string{"HTTPS_PROXY": "http://" + proxyAddr, "KEY": "dtn_secret_x"}

	// Proxy not running: never enforced.
	off := &DockerClient{proxyEnforcementEnabled: true}
	if off.sandboxProxyEnforced(plainEnv, "example.com") {
		t.Fatal("no enforcement expected when the shared proxy is not running")
	}

	// Enforcement globally disabled: never enforced.
	disabled := &DockerClient{secretProxyAddr: proxyAddr}
	if disabled.sandboxProxyEnforced(plainEnv, "example.com") {
		t.Fatal("no enforcement expected when proxy enforcement is disabled")
	}

	d := &DockerClient{secretProxyAddr: proxyAddr, proxyEnforcementEnabled: true}

	// No allow list: nothing to enforce on a hostname, stay on IP behavior.
	if d.sandboxProxyEnforced(plainEnv, "") || d.sandboxProxyEnforced(plainEnv, "  ") {
		t.Fatal("no enforcement expected without a domain allow list")
	}

	// The regression case: an allow list with NO proxy wiring and NO secrets
	// (e.g. applied after creation) must still be enforced — connect4 redirect +
	// end-to-end splice need neither the HTTP(S)_PROXY env nor the proxy CA.
	if !d.sandboxProxyEnforced(plainEnv, "example.com") {
		t.Fatal("an allowlisted, unwired, secret-less sandbox must be enforced")
	}
	if !d.sandboxProxyEnforced(wiredEnv, "example.com, *.github.com") {
		t.Fatal("an allowlisted wired sandbox must be enforced")
	}

	// A secret-using sandbox is enforced only once wired: its MITM'd hosts need
	// the mounted proxy CA, so enforcing before the wiring is present would break
	// TLS to those hosts.
	if d.sandboxProxyEnforced(secretEnv, "example.com") {
		t.Fatal("a secret-using sandbox without wiring must NOT be enforced")
	}
	if !d.sandboxProxyEnforced(wiredSecretEnv, "example.com") {
		t.Fatal("a secret-using sandbox with wiring must be enforced")
	}
}

func TestHasProxyWiring(t *testing.T) {
	d := &DockerClient{secretProxyAddr: "172.20.0.1:18080"}
	if !d.hasProxyWiring(map[string]string{"HTTPS_PROXY": "http://172.20.0.1:18080"}) {
		t.Fatal("expected wiring to be detected")
	}
	if d.hasProxyWiring(map[string]string{"HTTPS_PROXY": "http://user-proxy:3128"}) {
		t.Fatal("a user-set proxy must not count as runner wiring")
	}
	if d.hasProxyWiring(map[string]string{}) {
		t.Fatal("no wiring env → no wiring")
	}
	off := &DockerClient{}
	if off.hasProxyWiring(map[string]string{"HTTPS_PROXY": "http://172.20.0.1:18080"}) {
		t.Fatal("no wiring when the proxy is not running")
	}
}

func TestSandboxNetworkName_RunnerBridge(t *testing.T) {
	d := &DockerClient{interSandboxNetworkEnabled: false}
	if got := d.sandboxNetworkName(); got != RUNNER_BRIDGE_NETWORK_NAME {
		t.Errorf("sandboxNetworkName = %q, want %q", got, RUNNER_BRIDGE_NETWORK_NAME)
	}
}
