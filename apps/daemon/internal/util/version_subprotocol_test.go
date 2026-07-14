package util

import (
	"net/http"
	"testing"
)

func TestExtractSdkVersionSubprotocol_MultipleHeaderValues(t *testing.T) {
	header := http.Header{}
	header.Add("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~abc")
	header.Add("Sec-WebSocket-Protocol", "X-Daytona-SDK-Version~1.2.3")

	got := ExtractSdkVersionSubprotocol(header)
	if got != "X-Daytona-SDK-Version~1.2.3" {
		t.Fatalf("ExtractSdkVersionSubprotocol() = %q, want X-Daytona-SDK-Version~1.2.3", got)
	}
}

func TestExtractSdkVersionSubprotocol_SingleHeaderCommaSeparated(t *testing.T) {
	header := http.Header{}
	header.Set("Sec-WebSocket-Protocol", "X-Daytona-Pty-Envs~abc, X-Daytona-SDK-Version~9.9.9")

	got := ExtractSdkVersionSubprotocol(header)
	if got != "X-Daytona-SDK-Version~9.9.9" {
		t.Fatalf("ExtractSdkVersionSubprotocol() = %q, want X-Daytona-SDK-Version~9.9.9", got)
	}
}
