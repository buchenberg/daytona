package computeruse

import (
	"os"
	"reflect"
	"testing"
)

func TestEnvOr(t *testing.T) {
	const key = "DAYTONA_TEST_ENV_OR"
	original, hadOriginal := os.LookupEnv(key)
	t.Cleanup(func() {
		if hadOriginal {
			_ = os.Setenv(key, original)
		} else {
			_ = os.Unsetenv(key)
		}
	})

	_ = os.Unsetenv(key)
	if got := envOr(key, "fallback"); got != "fallback" {
		t.Fatalf("unset envOr = %q, want fallback", got)
	}

	t.Setenv(key, "")
	if got := envOr(key, "fallback"); got != "fallback" {
		t.Fatalf("empty envOr = %q, want fallback", got)
	}

	t.Setenv(key, "configured")
	if got := envOr(key, "fallback"); got != "configured" {
		t.Fatalf("configured envOr = %q, want configured", got)
	}
}

func TestResolveNoVNCBridgeFallsBackToWebsockify(t *testing.T) {
	cmd, args := resolveNoVNCBridge("5902", "6081")
	if cmd != "websockify" {
		t.Skipf("host has noVNC wrapper %q; fallback path not active", cmd)
	}

	want := []string{"--web=/usr/share/novnc/", "6081", "localhost:5902"}
	if !reflect.DeepEqual(args, want) {
		t.Fatalf("fallback args = %#v, want %#v", args, want)
	}
}
