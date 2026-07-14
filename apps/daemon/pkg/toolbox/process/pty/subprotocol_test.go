package pty

import (
	"encoding/base64"
	"encoding/json"
	"net/http"
	"strings"
	"testing"
)

func TestExtractPtyEnvsSubprotocol(t *testing.T) {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(`{"FOO":"bar"}`))
	header := http.Header{}
	header.Set("Sec-WebSocket-Protocol", "X-Daytona-SDK-Version~1.2.3, X-Daytona-Pty-Envs~"+encoded)

	envs, err := extractPtyEnvsSubprotocol(header)
	if err != nil {
		t.Fatalf("extractPtyEnvsSubprotocol() unexpected error: %v", err)
	}
	if len(envs) != 1 || envs["FOO"] != "bar" {
		t.Fatalf("extractPtyEnvsSubprotocol() = %v, want map[FOO:bar]", envs)
	}
}

func TestExtractPtyEnvsSubprotocol_MultipleHeaderValues(t *testing.T) {
	encoded := base64.RawURLEncoding.EncodeToString([]byte(`{"FOO":"bar"}`))
	header := http.Header{}
	header.Add("Sec-WebSocket-Protocol", "X-Daytona-SDK-Version~1.2.3")
	header.Add("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~"+encoded)

	envs, err := extractPtyEnvsSubprotocol(header)
	if err != nil {
		t.Fatalf("extractPtyEnvsSubprotocol() unexpected error: %v", err)
	}
	if len(envs) != 1 || envs["FOO"] != "bar" {
		t.Fatalf("extractPtyEnvsSubprotocol() = %v, want map[FOO:bar]", envs)
	}
}

func TestExtractPtyEnvsSubprotocol_Absent(t *testing.T) {
	// No Sec-WebSocket-Protocol header at all.
	envs, err := extractPtyEnvsSubprotocol(http.Header{})
	if err != nil {
		t.Fatalf("extractPtyEnvsSubprotocol(empty) unexpected error: %v", err)
	}
	if len(envs) != 0 {
		t.Fatalf("extractPtyEnvsSubprotocol(empty) = %v, want empty map", envs)
	}

	// Header present but envs token absent.
	header := http.Header{}
	header.Set("Sec-WebSocket-Protocol", "X-Daytona-SDK-Version~1.2.3")
	envs, err = extractPtyEnvsSubprotocol(header)
	if err != nil {
		t.Fatalf("extractPtyEnvsSubprotocol(no-token) unexpected error: %v", err)
	}
	if len(envs) != 0 {
		t.Fatalf("extractPtyEnvsSubprotocol(no-token) = %v, want empty map", envs)
	}
}

func TestExtractPtyEnvsSubprotocol_Invalid(t *testing.T) {
	// Invalid base64.
	header := http.Header{}
	header.Set("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~not!valid!base64")
	if _, err := extractPtyEnvsSubprotocol(header); err == nil {
		t.Fatal("extractPtyEnvsSubprotocol(bad base64) expected error, got nil")
	}

	// Valid base64 but invalid JSON.
	encoded := base64.RawURLEncoding.EncodeToString([]byte(`not json`))
	header = http.Header{}
	header.Set("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~"+encoded)
	if _, err := extractPtyEnvsSubprotocol(header); err == nil {
		t.Fatal("extractPtyEnvsSubprotocol(bad json) expected error, got nil")
	}
}

func TestExtractPtyEnvsSubprotocol_RejectsBadKeys(t *testing.T) {
	for _, badKey := range []string{"", "FOO=BAR", "FOO\nBAR", "FOO\x00BAR"} {
		payload, _ := json.Marshal(map[string]string{badKey: "value"})
		encoded := base64.RawURLEncoding.EncodeToString(payload)
		header := http.Header{}
		header.Set("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~"+encoded)
		if _, err := extractPtyEnvsSubprotocol(header); err == nil {
			t.Fatalf("extractPtyEnvsSubprotocol(key=%q) expected error, got nil", badKey)
		}
	}
}

func TestClientSupportsExitControl(t *testing.T) {
	if clientSupportsExitControl(http.Header{}) {
		t.Fatal("clientSupportsExitControl(empty) = true, want false")
	}

	h1 := http.Header{}
	h1.Set("Sec-WebSocket-Protocol", "X-Daytona-SDK-Version~1.2.3, X-Daytona-Pty-Exit-Control")
	if !clientSupportsExitControl(h1) {
		t.Fatal("clientSupportsExitControl(single header) = false, want true")
	}

	h2 := http.Header{}
	h2.Add("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~abc")
	h2.Add("Sec-WebSocket-Protocol", "X-Daytona-Pty-Exit-Control")
	if !clientSupportsExitControl(h2) {
		t.Fatal("clientSupportsExitControl(multi header) = false, want true")
	}
}

func TestExtractPtyEnvsSubprotocol_RejectsOversized(t *testing.T) {
	oversized := strings.Repeat("A", maxPtyEnvsEncodedLen+1)
	header := http.Header{}
	header.Set("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~"+oversized)
	if _, err := extractPtyEnvsSubprotocol(header); err == nil {
		t.Fatal("extractPtyEnvsSubprotocol(oversized) expected error, got nil")
	}
}
