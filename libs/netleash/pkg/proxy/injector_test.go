package proxy

import (
	"strings"
	"testing"
)

func TestGeneratePlaceholder_Format(t *testing.T) {
	p := GeneratePlaceholder()
	if !strings.HasPrefix(p, placeholderPrefix) {
		t.Fatalf("placeholder should start with %q, got %q", placeholderPrefix, p)
	}
	if !strings.HasSuffix(p, "__") {
		t.Fatalf("placeholder should end with __, got %q", p)
	}
	// __LEASH_SECRET_ (15) + 32 hex chars + __ (2) = 49
	if len(p) != 49 {
		t.Fatalf("expected length 49, got %d: %q", len(p), p)
	}
}

func TestGeneratePlaceholder_Unique(t *testing.T) {
	seen := make(map[string]bool)
	for i := 0; i < 100; i++ {
		p := GeneratePlaceholder()
		if seen[p] {
			t.Fatalf("duplicate placeholder generated: %q", p)
		}
		seen[p] = true
	}
}

func TestInjector_HasSecrets(t *testing.T) {
	empty := NewInjector(nil)
	if empty.HasSecrets() {
		t.Fatal("empty injector should return false")
	}

	withSecrets := NewInjector([]SecretConfig{{Name: "KEY", Value: "val", Hosts: []string{"h"}}})
	if !withSecrets.HasSecrets() {
		t.Fatal("injector with secrets should return true")
	}
}

func TestInjector_ReplaceBody_AllowedHost(t *testing.T) {
	inj := NewInjector([]SecretConfig{{
		Name:        "API_KEY",
		Placeholder: "PLACEHOLDER_123",
		Value:       "real-secret",
		Hosts:       []string{"api.example.com"},
	}})

	body := []byte("Authorization: Bearer PLACEHOLDER_123")
	got := inj.ReplaceBody("api.example.com", body)
	want := "Authorization: Bearer real-secret"
	if string(got) != want {
		t.Fatalf("got %q, want %q", got, want)
	}
}

func TestInjector_ReplaceBody_DisallowedHost(t *testing.T) {
	inj := NewInjector([]SecretConfig{{
		Name:        "API_KEY",
		Placeholder: "PLACEHOLDER_123",
		Value:       "real-secret",
		Hosts:       []string{"api.example.com"},
	}})

	body := []byte("Authorization: Bearer PLACEHOLDER_123")
	got := inj.ReplaceBody("evil.com", body)
	if string(got) != string(body) {
		t.Fatalf("body should be unchanged for disallowed host, got %q", got)
	}
}

func TestInjector_ReplaceBody_HostWithPort(t *testing.T) {
	inj := NewInjector([]SecretConfig{{
		Name:        "API_KEY",
		Placeholder: "PLACEHOLDER_123",
		Value:       "real-secret",
		Hosts:       []string{"api.example.com"},
	}})

	body := []byte("key=PLACEHOLDER_123")
	got := inj.ReplaceBody("api.example.com:443", body)
	if string(got) != "key=real-secret" {
		t.Fatalf("should strip port and match, got %q", got)
	}
}

func TestInjector_ReplaceBody_MultipleSecrets(t *testing.T) {
	inj := NewInjector([]SecretConfig{
		{Placeholder: "PH_A", Value: "secret_a", Hosts: []string{"host.com"}},
		{Placeholder: "PH_B", Value: "secret_b", Hosts: []string{"host.com"}},
	})

	body := []byte("a=PH_A&b=PH_B")
	got := inj.ReplaceBody("host.com", body)
	if string(got) != "a=secret_a&b=secret_b" {
		t.Fatalf("got %q", got)
	}
}

func TestInjector_ReplaceBody_MultipleOccurrences(t *testing.T) {
	inj := NewInjector([]SecretConfig{
		{Placeholder: "PH_X", Value: "real", Hosts: []string{"h.com"}},
	})

	body := []byte("PH_X and PH_X again")
	got := inj.ReplaceBody("h.com", body)
	if string(got) != "real and real again" {
		t.Fatalf("should replace all occurrences, got %q", got)
	}
}

func TestInjector_ReplaceString_AllowedHost(t *testing.T) {
	inj := NewInjector([]SecretConfig{{
		Placeholder: "PH_TOKEN",
		Value:       "sk-real-token",
		Hosts:       []string{"api.openai.com"},
	}})

	got := inj.ReplaceString("api.openai.com", "Bearer PH_TOKEN")
	if got != "Bearer sk-real-token" {
		t.Fatalf("got %q", got)
	}
}

func TestInjector_ReplaceString_DisallowedHost(t *testing.T) {
	inj := NewInjector([]SecretConfig{{
		Placeholder: "PH_TOKEN",
		Value:       "sk-real-token",
		Hosts:       []string{"api.openai.com"},
	}})

	got := inj.ReplaceString("evil.com", "Bearer PH_TOKEN")
	if got != "Bearer PH_TOKEN" {
		t.Fatalf("should not replace for disallowed host, got %q", got)
	}
}

func TestInjector_ReplaceString_CaseInsensitiveHost(t *testing.T) {
	inj := NewInjector([]SecretConfig{{
		Placeholder: "PH",
		Value:       "real",
		Hosts:       []string{"Api.Example.COM"},
	}})

	got := inj.ReplaceString("api.example.com", "PH")
	if got != "real" {
		t.Fatalf("host matching should be case-insensitive, got %q", got)
	}
}

func TestHostAllowed(t *testing.T) {
	tests := []struct {
		host    string
		allowed []string
		want    bool
	}{
		{"example.com", []string{"example.com"}, true},
		{"example.com", []string{"other.com"}, false},
		{"Example.COM", []string{"example.com"}, true},
		{"example.com", []string{"EXAMPLE.COM"}, true},
		{"example.com", nil, false},
		{"example.com", []string{}, false},
	}

	for _, tt := range tests {
		got := hostAllowed(tt.host, tt.allowed)
		if got != tt.want {
			t.Errorf("hostAllowed(%q, %v) = %v, want %v", tt.host, tt.allowed, got, tt.want)
		}
	}
}

func TestStripPort(t *testing.T) {
	tests := []struct {
		input string
		want  string
	}{
		{"example.com:443", "example.com"},
		{"example.com:80", "example.com"},
		{"example.com", "example.com"},
		{"[::1]:443", "[::1]"},
	}

	for _, tt := range tests {
		got := stripPort(tt.input)
		if got != tt.want {
			t.Errorf("stripPort(%q) = %q, want %q", tt.input, got, tt.want)
		}
	}
}
