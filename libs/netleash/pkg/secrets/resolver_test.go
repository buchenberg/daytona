package secrets

import (
	"context"
	"net/http"
	"net/http/httptest"
	"testing"
)

func TestAPIResolver_ResolvesAndMaps(t *testing.T) {
	var gotPath, gotAuth, gotSource string
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		gotPath = r.URL.Path
		gotAuth = r.Header.Get("Authorization")
		gotSource = r.Header.Get("X-Daytona-Source")
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusOK)
		_, _ = w.Write([]byte(`[
			{"env":"ANTHROPIC_API_KEY","placeholder":"dtn_secret_a1","value":"sk-ant-real","hosts":["api.anthropic.com"]},
			{"env":"OPENAI_API_KEY","placeholder":"dtn_secret_b2","value":"sk-openai","hosts":["api.openai.com","oai.example.com"]}
		]`))
	}))
	defer srv.Close()

	r := NewAPIResolver(srv.URL, "sb-123", "sandbox-auth-token")
	secrets, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve failed: %v", err)
	}

	if gotPath != "/sandbox/sb-123/secrets" {
		t.Fatalf("unexpected request path %q", gotPath)
	}
	if gotAuth != "Bearer sandbox-auth-token" {
		t.Fatalf("expected sandbox auth token as bearer, got %q", gotAuth)
	}
	if gotSource != "netleash" {
		t.Fatalf("expected X-Daytona-Source=netleash, got %q", gotSource)
	}

	if len(secrets) != 2 {
		t.Fatalf("expected 2 secrets, got %d", len(secrets))
	}
	if secrets[0].Name != "ANTHROPIC_API_KEY" || secrets[0].Placeholder != "dtn_secret_a1" ||
		secrets[0].Value != "sk-ant-real" || len(secrets[0].Hosts) != 1 || secrets[0].Hosts[0] != "api.anthropic.com" {
		t.Fatalf("first secret mapped incorrectly: %+v", secrets[0])
	}
	if len(secrets[1].Hosts) != 2 {
		t.Fatalf("expected 2 hosts on second secret, got %v", secrets[1].Hosts)
	}
}

func TestAPIResolver_SkipsIncompleteEntries(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[
			{"env":"GOOD","placeholder":"dtn_secret_x","value":"v","hosts":["h.com"]},
			{"env":"NO_VALUE","placeholder":"dtn_secret_y","hosts":["h.com"]},
			{"env":"NO_PLACEHOLDER","value":"v2","hosts":["h.com"]}
		]`))
	}))
	defer srv.Close()

	r := NewAPIResolver(srv.URL, "sb-1", "tok")
	secrets, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve failed: %v", err)
	}
	if len(secrets) != 1 || secrets[0].Name != "GOOD" {
		t.Fatalf("expected only the complete secret, got %+v", secrets)
	}
}

func TestAPIResolver_EmptyResult(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		_, _ = w.Write([]byte(`[]`))
	}))
	defer srv.Close()

	r := NewAPIResolver(srv.URL, "sb-1", "tok")
	secrets, err := r.Resolve(context.Background())
	if err != nil {
		t.Fatalf("Resolve failed: %v", err)
	}
	if len(secrets) != 0 {
		t.Fatalf("expected no secrets, got %d", len(secrets))
	}
}

func TestAPIResolver_ErrorOnUnauthorized(t *testing.T) {
	srv := httptest.NewServer(http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusUnauthorized)
	}))
	defer srv.Close()

	r := NewAPIResolver(srv.URL, "sb-1", "bad-token")
	if _, err := r.Resolve(context.Background()); err == nil {
		t.Fatal("expected error on unauthorized response")
	}
}
