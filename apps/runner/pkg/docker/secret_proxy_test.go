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

func TestSecretProxyEnvVars(t *testing.T) {
	secretEnv := map[string]string{"KEY": "dtn_secret_x"}
	plainEnv := map[string]string{"KEY": "plain"}

	// Disabled (no proxy address): never injects.
	off := &DockerClient{}
	if off.secretProxyEnvVars(secretEnv) != nil {
		t.Fatal("no env vars expected when secret proxy is disabled")
	}

	d := &DockerClient{secretProxyAddr: "172.20.0.1:18080"}
	// No secrets in env: no injection (non-secret sandboxes untouched).
	if d.secretProxyEnvVars(plainEnv) != nil {
		t.Fatal("no env vars expected when the sandbox uses no secrets")
	}
	got := d.secretProxyEnvVars(secretEnv)
	if !slices.Contains(got, "HTTPS_PROXY=http://172.20.0.1:18080") {
		t.Errorf("expected HTTPS_PROXY in %v", got)
	}
	if !slices.Contains(got, "SSL_CERT_FILE="+secretCAContainerPath) {
		t.Errorf("expected SSL_CERT_FILE in %v", got)
	}
	if !slices.Contains(got, "NO_PROXY=localhost,127.0.0.1,::1") {
		t.Errorf("expected NO_PROXY in %v", got)
	}
}

func TestSecretProxyCABind(t *testing.T) {
	secretEnv := map[string]string{"KEY": "dtn_secret_x"}

	off := &DockerClient{}
	if off.secretProxyCABind(secretEnv) != "" {
		t.Fatal("no bind expected when CA path is unset")
	}

	d := &DockerClient{secretProxyCACert: "/var/lib/netleash/ca.crt"}
	if d.secretProxyCABind(map[string]string{"KEY": "plain"}) != "" {
		t.Fatal("no bind expected when the sandbox uses no secrets")
	}
	want := "/var/lib/netleash/ca.crt:" + secretCAContainerPath + ":ro"
	if got := d.secretProxyCABind(secretEnv); got != want {
		t.Errorf("secretProxyCABind = %q, want %q", got, want)
	}
}

func TestSandboxNetworkName_RunnerBridge(t *testing.T) {
	d := &DockerClient{interSandboxNetworkEnabled: false}
	if got := d.sandboxNetworkName(); got != RUNNER_BRIDGE_NETWORK_NAME {
		t.Errorf("sandboxNetworkName = %q, want %q", got, RUNNER_BRIDGE_NETWORK_NAME)
	}
}
