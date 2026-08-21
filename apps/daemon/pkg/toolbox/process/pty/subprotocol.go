package pty

import (
	"encoding/base64"
	"encoding/json"
	"fmt"
	"net/http"
	"strings"
)

// ptyEnvsSubprotocolPrefix carries PTY env vars as a WebSocket subprotocol token
// (not a header/query) so they reach the daemon across all SDK runtimes and stay
// out of request URLs.
const ptyEnvsSubprotocolPrefix = "X-Daytona-Pty-Envs~"

// maxPtyEnvsEncodedLen caps the base64url env token so a client cannot ship up to
// the ~1MB net/http header limit of env JSON. 64 KiB of encoded data is far more
// than any legitimate env set.
const maxPtyEnvsEncodedLen = 64 * 1024

// validatePtyEnvKey rejects env names that would let a client inject extra
// assignments or break the KEY=VALUE contract the PTY passes to the shell:
// names must be non-empty and free of '=', NUL, and newline characters.
func validatePtyEnvKey(key string) error {
	if key == "" {
		return fmt.Errorf("env var name must not be empty")
	}
	if strings.ContainsAny(key, "=\x00\n\r") {
		return fmt.Errorf("env var name %q must not contain '=', NUL, or newline", key)
	}
	return nil
}

// ptyExitControlSubprotocol is a capability token a client offers to opt in to the
// "exited" control message (sent on the data channel before the WS close frame).
// Clients that don't advertise it — including older SDKs that treat an unknown
// control status as fatal — only receive the universal close frame, so this new
// message can never break them.
const ptyExitControlSubprotocol = "X-Daytona-Pty-Exit-Control"

// clientSupportsExitControl reports whether the client advertised the exit-control
// capability token in Sec-WebSocket-Protocol.
func clientSupportsExitControl(header http.Header) bool {
	for _, headerValue := range header.Values("Sec-WebSocket-Protocol") {
		for _, subprotocol := range strings.Split(headerValue, ",") {
			if strings.TrimSpace(subprotocol) == ptyExitControlSubprotocol {
				return true
			}
		}
	}
	return false
}

// extractPtyEnvsSubprotocol decodes env vars from the X-Daytona-Pty-Envs~ token
// (base64url JSON) in Sec-WebSocket-Protocol. Empty map if absent, error if malformed.
func extractPtyEnvsSubprotocol(header http.Header) (map[string]string, error) {
	envs := make(map[string]string)

	// A client (or intermediary) may split the subprotocol list across multiple
	// Sec-WebSocket-Protocol header lines, so scan every value rather than only
	// the first that header.Get would return.
	for _, headerValue := range header.Values("Sec-WebSocket-Protocol") {
		for _, subprotocol := range strings.Split(headerValue, ",") {
			subprotocol = strings.TrimSpace(subprotocol)
			if !strings.HasPrefix(subprotocol, ptyEnvsSubprotocolPrefix) {
				continue
			}

			encoded := strings.TrimPrefix(subprotocol, ptyEnvsSubprotocolPrefix)
			if len(encoded) > maxPtyEnvsEncodedLen {
				return nil, fmt.Errorf("PTY envs subprotocol too large (%d bytes, max %d)", len(encoded), maxPtyEnvsEncodedLen)
			}
			decoded, err := base64.RawURLEncoding.DecodeString(encoded)
			if err != nil {
				return nil, fmt.Errorf("failed to decode PTY envs subprotocol: %w", err)
			}
			if err := json.Unmarshal(decoded, &envs); err != nil {
				return nil, fmt.Errorf("failed to unmarshal PTY envs subprotocol: %w", err)
			}
			for key := range envs {
				if err := validatePtyEnvKey(key); err != nil {
					return nil, err
				}
			}
			return envs, nil
		}
	}

	return envs, nil
}
