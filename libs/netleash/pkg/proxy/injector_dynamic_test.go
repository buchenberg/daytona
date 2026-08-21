package proxy

import (
	"context"
	"errors"
	"sync/atomic"
	"testing"
	"time"
)

func TestResolvingInjector_ReplacesAndCaches(t *testing.T) {
	var calls int32
	resolver := ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		atomic.AddInt32(&calls, 1)
		return []SecretConfig{{
			Placeholder: "dtn_secret_abc",
			Value:       "real-value",
			Hosts:       []string{"api.example.com"},
		}}, nil
	})
	inj := NewResolvingInjector(resolver, time.Minute, "dtn_secret_")

	if !inj.HasSecrets() {
		t.Fatal("resolving injector should always report HasSecrets")
	}

	if got := inj.ReplaceString("api.example.com", "Bearer dtn_secret_abc"); got != "Bearer real-value" {
		t.Fatalf("got %q, want %q", got, "Bearer real-value")
	}
	// A second request within the TTL must reuse the cached snapshot.
	if got := inj.ReplaceString("api.example.com:443", "Bearer dtn_secret_abc"); got != "Bearer real-value" {
		t.Fatalf("cached replace got %q", got)
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected resolver called once (cached), got %d", n)
	}
}

func TestResolvingInjector_MarkerSkipsResolution(t *testing.T) {
	var calls int32
	resolver := ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		atomic.AddInt32(&calls, 1)
		return nil, nil
	})
	inj := NewResolvingInjector(resolver, time.Minute, "dtn_secret_")

	// No placeholder marker in the data → resolver must never be consulted.
	if got := inj.ReplaceString("api.example.com", "Bearer plain-token"); got != "Bearer plain-token" {
		t.Fatalf("got %q, want unchanged", got)
	}
	if got := string(inj.ReplaceBody("api.example.com", []byte("nothing to see"))); got != "nothing to see" {
		t.Fatalf("body got %q, want unchanged", got)
	}
	if n := atomic.LoadInt32(&calls); n != 0 {
		t.Fatalf("expected resolver never called, got %d", n)
	}
}

func TestResolvingInjector_DisallowedHost(t *testing.T) {
	resolver := ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		return []SecretConfig{{
			Placeholder: "dtn_secret_abc",
			Value:       "real-value",
			Hosts:       []string{"api.example.com"},
		}}, nil
	})
	inj := NewResolvingInjector(resolver, time.Minute, "dtn_secret_")

	if got := inj.ReplaceString("evil.com", "Bearer dtn_secret_abc"); got != "Bearer dtn_secret_abc" {
		t.Fatalf("secret must not be injected for disallowed host, got %q", got)
	}
}

func TestResolvingInjector_ResolverErrorPassesThrough(t *testing.T) {
	var calls int32
	resolver := ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		atomic.AddInt32(&calls, 1)
		return nil, errors.New("api unreachable")
	})
	inj := NewResolvingInjector(resolver, time.Minute, "dtn_secret_")

	// With no cached snapshot, a resolver error leaves the placeholder in place
	// rather than failing — the real secret is never leaked on failure.
	if got := inj.ReplaceString("api.example.com", "Bearer dtn_secret_abc"); got != "Bearer dtn_secret_abc" {
		t.Fatalf("got %q, want placeholder unchanged on error", got)
	}
	// The failure must not be cached: the next request retries.
	_ = inj.ReplaceString("api.example.com", "Bearer dtn_secret_abc")
	if n := atomic.LoadInt32(&calls); n != 2 {
		t.Fatalf("expected resolver retried after error, calls=%d", n)
	}
}

func TestResolvingInjector_CacheExpiryRefetches(t *testing.T) {
	var calls int32
	resolver := ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		atomic.AddInt32(&calls, 1)
		return []SecretConfig{{
			Placeholder: "dtn_secret_abc",
			Value:       "real-value",
			Hosts:       []string{"api.example.com"},
		}}, nil
	})
	inj := NewResolvingInjector(resolver, time.Millisecond, "dtn_secret_")

	_ = inj.ReplaceString("api.example.com", "dtn_secret_abc")
	time.Sleep(10 * time.Millisecond) // let the TTL lapse
	_ = inj.ReplaceString("api.example.com", "dtn_secret_abc")

	if n := atomic.LoadInt32(&calls); n < 2 {
		t.Fatalf("expected resolver re-consulted after TTL, calls=%d", n)
	}
}

func TestResolvingInjector_DefaultTTL(t *testing.T) {
	// A non-positive TTL must fall back to a sane default rather than 0 (which
	// would re-resolve on every request).
	inj := NewResolvingInjector(ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		return nil, nil
	}), 0, "")
	if inj.ttl <= 0 {
		t.Fatalf("expected positive default TTL, got %v", inj.ttl)
	}
}

func TestResolvingInjector_NoMarkerAlwaysResolves(t *testing.T) {
	var calls int32
	resolver := ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		atomic.AddInt32(&calls, 1)
		return []SecretConfig{{Placeholder: "PH", Value: "v", Hosts: []string{"h.com"}}}, nil
	})
	inj := NewResolvingInjector(resolver, time.Minute, "") // empty marker

	if got := inj.ReplaceString("h.com", "PH"); got != "v" {
		t.Fatalf("got %q", got)
	}
	if n := atomic.LoadInt32(&calls); n != 1 {
		t.Fatalf("expected resolver consulted with empty marker, calls=%d", n)
	}
}
