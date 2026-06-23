package proxy

import (
	"bytes"
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"strings"
)

// SecretConfig defines a secret that should be injected into outbound requests.
type SecretConfig struct {
	Name        string   // env var name (e.g. "OPENAI_API_KEY")
	Placeholder string   // placeholder value given to child process
	Value       string   // real secret value (never exposed to child)
	Hosts       []string // only inject for these hosts
}

// Injector replaces placeholder strings with real secret values for approved hosts.
type Injector struct {
	secrets []SecretConfig
}

// NewInjector creates an Injector with the given secret configs.
func NewInjector(secrets []SecretConfig) *Injector {
	return &Injector{secrets: secrets}
}

// ReplaceBody replaces all placeholder occurrences in body with real values,
// but ONLY if the host is in the approved list for that secret.
func (inj *Injector) ReplaceBody(host string, body []byte) []byte {
	// Strip port from host if present.
	h := stripPort(host)

	for _, s := range inj.secrets {
		if !hostAllowed(h, s.Hosts) {
			continue
		}
		body = bytes.ReplaceAll(body, []byte(s.Placeholder), []byte(s.Value))
	}
	return body
}

// ReplaceString replaces placeholders in a string (used for HTTP headers).
func (inj *Injector) ReplaceString(host string, val string) string {
	h := stripPort(host)

	for _, s := range inj.secrets {
		if !hostAllowed(h, s.Hosts) {
			continue
		}
		val = strings.ReplaceAll(val, s.Placeholder, s.Value)
	}
	return val
}

// HasSecrets returns true if any secrets are configured.
func (inj *Injector) HasSecrets() bool {
	return len(inj.secrets) > 0
}

const placeholderPrefix = "__LEASH_SECRET_"

// GeneratePlaceholder creates a random placeholder string for a secret.
func GeneratePlaceholder() string {
	b := make([]byte, 16)
	rand.Read(b)
	return fmt.Sprintf("%s%s__", placeholderPrefix, hex.EncodeToString(b))
}

func hostAllowed(host string, allowed []string) bool {
	for _, a := range allowed {
		if strings.EqualFold(host, a) {
			return true
		}
	}
	return false
}

func stripPort(host string) string {
	if i := strings.LastIndex(host, ":"); i != -1 {
		return host[:i]
	}
	return host
}
