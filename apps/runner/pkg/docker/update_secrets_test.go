package docker

import "testing"

// secretEnvInSync must flag drift in the proxy wiring, not just in the secret
// placeholders — an allowlist-only change while a sandbox is stopped has to
// trigger recreation so proxy enforcement can attach (or detach) its wiring.
func TestSecretEnvInSync(t *testing.T) {
	const proxyAddr = "172.20.0.1:18080"
	wired := "HTTPS_PROXY=http://" + proxyAddr

	enforced := &DockerClient{secretProxyAddr: proxyAddr, proxyEnforcementEnabled: true}
	plain := &DockerClient{secretProxyAddr: proxyAddr}

	// Nothing changed: no secrets, no allow list, no wiring.
	if !enforced.secretEnvInSync([]string{"FOO=bar"}, map[string]string{}, "") {
		t.Fatal("unchanged secret-less sandbox should be in sync")
	}

	// Secrets unchanged and wiring already present for an allowlisted sandbox.
	if !enforced.secretEnvInSync([]string{"FOO=bar", wired}, map[string]string{}, "example.com") {
		t.Fatal("wired allowlisted sandbox should be in sync")
	}

	// The reported bug: allow list added while stopped, no secret change — the
	// sandbox now needs wiring it doesn't have, so it must NOT be in sync.
	if enforced.secretEnvInSync([]string{"FOO=bar"}, map[string]string{}, "example.com") {
		t.Fatal("allowlist-only change must trigger recreation to add proxy wiring")
	}

	// Same allowlist change without proxy enforcement: no wiring needed, in sync.
	if !plain.secretEnvInSync([]string{"FOO=bar"}, map[string]string{}, "example.com") {
		t.Fatal("allowlist change without enforcement must not trigger recreation")
	}

	// Allow list removed while stopped: stale wiring (with no proxy policy
	// binding behind it) must be stripped via recreation.
	if enforced.secretEnvInSync([]string{"FOO=bar", wired}, map[string]string{}, "") {
		t.Fatal("stale wiring after allowlist removal must trigger recreation")
	}

	// Secret placeholders differing still triggers recreation as before.
	if enforced.secretEnvInSync([]string{"KEY=dtn_secret_old", wired}, map[string]string{"KEY": "dtn_secret_new"}, "") {
		t.Fatal("changed placeholder must trigger recreation")
	}
	if !enforced.secretEnvInSync([]string{"KEY=dtn_secret_a", wired}, map[string]string{"KEY": "dtn_secret_a"}, "") {
		t.Fatal("matching placeholder with wiring should be in sync")
	}

	// Wiring pointing at a previous proxy address counts as absent, so a
	// secret-using sandbox gets refreshed wiring on restart.
	if enforced.secretEnvInSync([]string{"KEY=dtn_secret_a", "HTTPS_PROXY=http://10.0.0.1:9999"}, map[string]string{"KEY": "dtn_secret_a"}, "") {
		t.Fatal("stale proxy address must trigger recreation")
	}
}
