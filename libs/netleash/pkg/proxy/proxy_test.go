package proxy

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
)

var quiet = WithLogger(slog.New(slog.NewTextHandler(io.Discard, nil)))

func TestNewServer_ExactDomains(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"example.com", "api.github.com"}, "", quiet)

	if !s.static.allowedDomains["example.com"] {
		t.Fatal("example.com should be allowed")
	}
	if !s.static.allowedDomains["api.github.com"] {
		t.Fatal("api.github.com should be allowed")
	}
	if s.static.allowedDomains["evil.com"] {
		t.Fatal("evil.com should not be allowed")
	}
	if len(s.static.wildcardSuffixes) != 0 {
		t.Fatalf("expected no wildcard suffixes, got %v", s.static.wildcardSuffixes)
	}
}

func TestNewServer_WildcardDomains(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"*.github.com"}, "", quiet)

	// Wildcard base domain should be in exact match too.
	if !s.static.allowedDomains["github.com"] {
		t.Fatal("github.com (base) should be in allowed domains")
	}
	if len(s.static.wildcardSuffixes) != 1 || s.static.wildcardSuffixes[0] != ".github.com" {
		t.Fatalf("expected [.github.com], got %v", s.static.wildcardSuffixes)
	}
}

func TestNewServer_ClientIPRestriction(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"example.com"}, "172.17.0.2", quiet)

	if s.allowedClientIP == nil {
		t.Fatal("allowedClientIP should be set")
	}
	if !s.allowedClientIP.Equal(net.ParseIP("172.17.0.2")) {
		t.Fatalf("expected 172.17.0.2, got %v", s.allowedClientIP)
	}
}

func TestNewServer_NoClientIPRestriction(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"example.com"}, "", quiet)

	if s.allowedClientIP != nil {
		t.Fatalf("allowedClientIP should be nil, got %v", s.allowedClientIP)
	}
}

func TestNewServer_DomainLowercased(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"Example.COM", "*.GitHub.COM"}, "", quiet)

	if !s.static.allowedDomains["example.com"] {
		t.Fatal("domains should be lowercased")
	}
	if !s.static.allowedDomains["github.com"] {
		t.Fatal("wildcard base should be lowercased")
	}
}

func TestIsAllowed_ExactMatch(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"example.com", "api.github.com"}, "", quiet)

	if !s.static.isAllowed("example.com") {
		t.Fatal("example.com should be allowed")
	}
	if !s.static.isAllowed("api.github.com") {
		t.Fatal("api.github.com should be allowed")
	}
	if s.static.isAllowed("evil.com") {
		t.Fatal("evil.com should not be allowed")
	}
}

func TestIsAllowed_CaseInsensitive(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"example.com"}, "", quiet)

	if !s.static.isAllowed("Example.COM") {
		t.Fatal("isAllowed should be case-insensitive")
	}
}

func TestIsAllowed_WildcardMatch(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"*.github.com"}, "", quiet)

	if !s.static.isAllowed("api.github.com") {
		t.Fatal("api.github.com should match *.github.com")
	}
	if !s.static.isAllowed("raw.githubusercontent.github.com") {
		t.Fatal("deep subdomain should match *.github.com")
	}
	if !s.static.isAllowed("github.com") {
		t.Fatal("base domain should be allowed too")
	}
	if s.static.isAllowed("evil.com") {
		t.Fatal("evil.com should not match *.github.com")
	}
}

func TestServer_StartClose(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"example.com"}, "", quiet)

	addr, err := s.Start()
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}

	if addr == "" {
		t.Fatal("expected non-empty address")
	}

	// Verify we can connect.
	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("failed to connect to proxy: %v", err)
	}
	conn.Close()

	s.Close()

	// After close, should not accept connections.
	_, err = net.Dial("tcp", addr)
	if err == nil {
		t.Fatal("expected connection to fail after Close")
	}
}

func TestServer_HTTPProxy_AllowedHost(t *testing.T) {
	// Start a local backend server.
	backend := http.NewServeMux()
	backend.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		w.WriteHeader(http.StatusOK)
		w.Write([]byte("backend response"))
	})
	backendServer := &http.Server{Handler: backend}
	backendLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("backend listen failed: %v", err)
	}
	defer backendServer.Close()
	go backendServer.Serve(backendLn)

	// Start the proxy allowing "127.0.0.1".
	ca, _ := GenerateCA()
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"127.0.0.1"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	// Make an HTTP request through the proxy.
	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	resp, err := client.Get(fmt.Sprintf("http://%s/test", backendLn.Addr().String()))
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "backend response" {
		t.Fatalf("expected 'backend response', got %q", body)
	}
}

func TestServer_HTTPProxy_BlockedHost(t *testing.T) {
	ca, _ := GenerateCA()
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"allowed.com"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	resp, err := client.Get("http://blocked.com/test")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for blocked host, got %d", resp.StatusCode)
	}
}

func TestServer_HTTPProxy_SecretInjection(t *testing.T) {
	// Start a backend that echoes the Authorization header.
	var receivedAuth string
	backend := http.NewServeMux()
	backend.HandleFunc("/api", func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	})
	backendServer := &http.Server{Handler: backend}
	backendLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("backend listen failed: %v", err)
	}
	defer backendServer.Close()
	go backendServer.Serve(backendLn)

	ca, _ := GenerateCA()
	injector := NewInjector([]SecretConfig{{
		Placeholder: "PLACEHOLDER_TOKEN",
		Value:       "real-secret-token",
		Hosts:       []string{"127.0.0.1"},
	}})
	s := NewServer("127.0.0.1:0", ca, injector, []string{"127.0.0.1"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	req, _ := http.NewRequest("GET", fmt.Sprintf("http://%s/api", backendLn.Addr().String()), nil)
	req.Header.Set("Authorization", "Bearer PLACEHOLDER_TOKEN")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("proxy request failed: %v", err)
	}
	resp.Body.Close()

	if receivedAuth != "Bearer real-secret-token" {
		t.Fatalf("expected secret to be injected, got %q", receivedAuth)
	}
}

// startHTTPSBackend starts a local HTTPS server using a cert signed by the given CA.
// Returns the listener (caller must close) and the "localhost:<port>" address.
func startHTTPSBackend(t *testing.T, ca *CA, handler http.Handler) (net.Listener, string) {
	t.Helper()

	cert, err := ca.MintCert("localhost")
	if err != nil {
		t.Fatalf("MintCert for backend failed: %v", err)
	}

	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{
		Certificates: []tls.Certificate{*cert},
	})
	if err != nil {
		t.Fatalf("backend tls.Listen failed: %v", err)
	}

	go http.Serve(ln, handler)

	_, port, _ := net.SplitHostPort(ln.Addr().String())
	return ln, "localhost:" + port
}

// withTrustedCA temporarily overrides http.DefaultTransport so the proxy's
// upstream TLS connections trust the given CA. Restores on test cleanup.
func withTrustedCA(t *testing.T, ca *CA) {
	t.Helper()
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca.PEM)

	orig := http.DefaultTransport
	http.DefaultTransport = &http.Transport{
		TLSClientConfig: &tls.Config{RootCAs: pool},
	}
	t.Cleanup(func() { http.DefaultTransport = orig })
}

// proxyClient creates an HTTP client that routes through the proxy and trusts the CA.
func proxyClient(proxyAddr string, ca *CA) *http.Client {
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(ca.PEM)
	proxyURL, _ := url.Parse("http://" + proxyAddr)
	return &http.Client{
		Transport: &http.Transport{
			Proxy:           http.ProxyURL(proxyURL),
			TLSClientConfig: &tls.Config{RootCAs: pool},
		},
	}
}

func TestServer_CONNECTProxy_AllowedHost(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/secure", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("secure response"))
	})
	backendLn, backendAddr := startHTTPSBackend(t, ca, mux)
	defer backendLn.Close()

	withTrustedCA(t, ca)

	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"localhost"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	client := proxyClient(proxyAddr, ca)

	resp, err := client.Get(fmt.Sprintf("https://%s/secure", backendAddr))
	if err != nil {
		t.Fatalf("CONNECT proxy request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}

	body, _ := io.ReadAll(resp.Body)
	if string(body) != "secure response" {
		t.Fatalf("expected 'secure response', got %q", body)
	}
}

func TestServer_CONNECTProxy_BlockedHost(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	withTrustedCA(t, ca)

	// Only allow "allowed.com", not "localhost".
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"allowed.com"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	client := proxyClient(proxyAddr, ca)

	// CONNECT to blocked host should fail — proxy sends 403 before TLS handshake.
	_, err = client.Get("https://localhost:9999/test")
	if err == nil {
		t.Fatal("expected error for blocked CONNECT host")
	}
	if !strings.Contains(err.Error(), "403") {
		// Go's CONNECT handling surfaces the 403 as a transport error.
		t.Logf("got expected error: %v", err)
	}
}

func TestServer_CONNECTProxy_SecretInjection(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	var receivedAuth string
	mux := http.NewServeMux()
	mux.HandleFunc("/api", func(w http.ResponseWriter, r *http.Request) {
		receivedAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	})
	backendLn, backendAddr := startHTTPSBackend(t, ca, mux)
	defer backendLn.Close()

	withTrustedCA(t, ca)

	injector := NewInjector([]SecretConfig{{
		Placeholder: "PH_SECRET",
		Value:       "real-api-key",
		Hosts:       []string{"localhost"},
	}})
	s := NewServer("127.0.0.1:0", ca, injector, []string{"localhost"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	client := proxyClient(proxyAddr, ca)

	req, _ := http.NewRequest("GET", fmt.Sprintf("https://%s/api", backendAddr), nil)
	req.Header.Set("Authorization", "Bearer PH_SECRET")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("CONNECT proxy request failed: %v", err)
	}
	resp.Body.Close()

	if receivedAuth != "Bearer real-api-key" {
		t.Fatalf("expected secret injected in CONNECT tunnel, got %q", receivedAuth)
	}
}

// An unresolvable host reached over HTTPS (CONNECT) must fail the tunnel, not
// establish it — so the client gets a transport error (a non-zero curl exit)
// rather than an empty 200-tunnel. The error must not leak the proxy.
func TestServer_CONNECTProxy_UnresolvableHost(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	withTrustedCA(t, ca)

	// Allow the (non-existent) host so we get past the allowlist 403 and exercise
	// the DNS-resolution failure path. The name has no "netleash" in it so the
	// "no proxy leak" assertion below is meaningful.
	const host = "does-not-exist.example.invalid"
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{host}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	client := proxyClient(proxyAddr, ca)

	_, err = client.Get(fmt.Sprintf("https://%s/whatever", host))
	if err == nil {
		t.Fatal("expected CONNECT to fail for an unresolvable host")
	}
	// The proxy replied 502 to the CONNECT. Clients surface that differently (curl:
	// "Received HTTP code 502 from proxy after CONNECT"; Go: "Bad Gateway"), so
	// accept either spelling — the point is the tunnel failed (non-zero exit).
	msg := strings.ToLower(err.Error())
	if !strings.Contains(msg, "502") && !strings.Contains(msg, "bad gateway") {
		t.Fatalf("expected a 502/Bad Gateway CONNECT failure, got: %v", err)
	}
	if strings.Contains(msg, "netleash") {
		t.Fatalf("error must not mention the proxy, got: %v", err)
	}
}

// An unresolvable host reached over plain HTTP must drop the connection rather
// than return a 502 body (which curl would treat as a successful exit-0
// response). The client must see a transport error with no proxy details.
func TestServer_HTTPProxy_UnresolvableHost(t *testing.T) {
	ca, _ := GenerateCA()
	const host = "does-not-exist.example.invalid"
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{host}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	_, err = client.Get(fmt.Sprintf("http://%s/whatever", host))
	if err == nil {
		t.Fatal("expected the request to fail for an unresolvable host")
	}
	if strings.Contains(strings.ToLower(err.Error()), "netleash") {
		t.Fatalf("error must not mention the proxy, got: %v", err)
	}
}

func TestServer_AuthToken_Required(t *testing.T) {
	ca, _ := GenerateCA()
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"127.0.0.1"}, "", quiet, WithAuthToken("test-token"))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	// Start a backend.
	backend := http.NewServeMux()
	backend.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("ok"))
	})
	backendServer := &http.Server{Handler: backend}
	backendLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("backend listen failed: %v", err)
	}
	defer backendServer.Close()
	go backendServer.Serve(backendLn)

	// Request without token should get 407.
	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	resp, err := client.Get(fmt.Sprintf("http://%s/test", backendLn.Addr().String()))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 407 {
		t.Fatalf("expected 407, got %d", resp.StatusCode)
	}
}

func TestServer_AuthToken_ValidToken(t *testing.T) {
	ca, _ := GenerateCA()
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"127.0.0.1"}, "", quiet, WithAuthToken("test-token"))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	backend := http.NewServeMux()
	backend.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		// Proxy-Authorization should be stripped before forwarding.
		if r.Header.Get("Proxy-Authorization") != "" {
			t.Error("Proxy-Authorization should be stripped from forwarded request")
		}
		w.Write([]byte("authenticated"))
	})
	backendServer := &http.Server{Handler: backend}
	backendLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("backend listen failed: %v", err)
	}
	defer backendServer.Close()
	go backendServer.Serve(backendLn)

	// Custom transport that adds the Proxy-Authorization header.
	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{
		Transport: &http.Transport{
			Proxy: http.ProxyURL(proxyURL),
			ProxyConnectHeader: http.Header{
				"Proxy-Authorization": []string{"Bearer test-token"},
			},
		},
	}

	req, _ := http.NewRequest("GET", fmt.Sprintf("http://%s/test", backendLn.Addr().String()), nil)
	req.Header.Set("Proxy-Authorization", "Bearer test-token")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
	if string(body) != "authenticated" {
		t.Fatalf("expected 'authenticated', got %q", body)
	}
}

func TestServer_AuthToken_WrongToken(t *testing.T) {
	ca, _ := GenerateCA()
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"127.0.0.1"}, "", quiet, WithAuthToken("correct-token"))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	req, _ := http.NewRequest("GET", "http://127.0.0.1:9999/test", nil)
	req.Header.Set("Proxy-Authorization", "Bearer wrong-token")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != 407 {
		t.Fatalf("expected 407 for wrong token, got %d", resp.StatusCode)
	}
}

func TestServer_AuthToken_NotRequired(t *testing.T) {
	// When no auth token is configured, requests should pass through without auth.
	ca, _ := GenerateCA()
	s := NewServer("127.0.0.1:0", ca, NewInjector(nil), []string{"127.0.0.1"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	backend := http.NewServeMux()
	backend.HandleFunc("/test", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("no auth needed"))
	})
	backendServer := &http.Server{Handler: backend}
	backendLn, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("backend listen failed: %v", err)
	}
	defer backendServer.Close()
	go backendServer.Serve(backendLn)

	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}

	resp, err := client.Get(fmt.Sprintf("http://%s/test", backendLn.Addr().String()))
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != 200 {
		t.Fatalf("expected 200, got %d", resp.StatusCode)
	}
}

func TestServer_CONNECTProxy_BodySecretInjection(t *testing.T) {
	ca, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}

	var receivedBody string
	mux := http.NewServeMux()
	mux.HandleFunc("/api", func(w http.ResponseWriter, r *http.Request) {
		body, _ := io.ReadAll(r.Body)
		receivedBody = string(body)
		w.WriteHeader(http.StatusOK)
	})
	backendLn, backendAddr := startHTTPSBackend(t, ca, mux)
	defer backendLn.Close()

	withTrustedCA(t, ca)

	injector := NewInjector([]SecretConfig{{
		Placeholder: "PH_BODY_SECRET",
		Value:       "real-body-secret",
		Hosts:       []string{"localhost"},
	}})
	s := NewServer("127.0.0.1:0", ca, injector, []string{"localhost"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	client := proxyClient(proxyAddr, ca)

	req, _ := http.NewRequest("POST", fmt.Sprintf("https://%s/api", backendAddr),
		strings.NewReader(`{"key":"PH_BODY_SECRET"}`))
	req.Header.Set("Content-Type", "application/json")

	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("CONNECT proxy POST failed: %v", err)
	}
	resp.Body.Close()

	if receivedBody != `{"key":"real-body-secret"}` {
		t.Fatalf("expected body secret injected, got %q", receivedBody)
	}
}
