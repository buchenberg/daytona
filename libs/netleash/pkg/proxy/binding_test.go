package proxy

import (
	"bufio"
	"context"
	"fmt"
	"net"
	"net/http"
	"net/url"
	"strings"
	"testing"
	"time"
)

func TestBinding_isAllowed(t *testing.T) {
	b := NewBinding("x", false, []string{"example.com", "*.github.com"}, nil)
	cases := map[string]bool{
		"example.com":    true,
		"EXAMPLE.COM":    true,
		"api.github.com": true,
		"github.com":     true,
		"evil.com":       false,
	}
	for h, want := range cases {
		if got := b.isAllowed(h); got != want {
			t.Errorf("isAllowed(%q) = %v, want %v", h, got, want)
		}
	}

	all := NewBinding("y", true, nil, nil)
	if !all.isAllowed("anything.example") {
		t.Fatal("allowAll binding should permit any host")
	}
}

func TestRegistry_RegisterLookupUnregister(t *testing.T) {
	r := NewRegistry()
	ip := net.ParseIP("172.20.0.5")
	b := NewBinding("sb-1", true, nil, nil)

	r.Register("sb-1", ip, b)
	if r.Lookup(ip) != b {
		t.Fatal("expected binding for registered IP")
	}
	if r.Lookup(net.ParseIP("172.20.0.6")) != nil {
		t.Fatal("unregistered IP should resolve to nil")
	}
	if r.Lookup(nil) != nil {
		t.Fatal("nil IP should resolve to nil")
	}
	if r.Len() != 1 {
		t.Fatalf("Len = %d, want 1", r.Len())
	}

	// Re-registering the same id on a new IP drops the old IP mapping.
	ip2 := net.ParseIP("172.20.0.7")
	r.Register("sb-1", ip2, b)
	if r.Lookup(ip) != nil {
		t.Fatal("old IP should no longer resolve after re-register")
	}
	if r.Lookup(ip2) != b {
		t.Fatal("new IP should resolve after re-register")
	}

	r.Unregister("sb-1")
	if r.Lookup(ip2) != nil || r.Len() != 0 {
		t.Fatal("Unregister did not clear the binding")
	}
	r.Unregister("does-not-exist") // must not panic
}

func TestMuxServer_InjectsForRegisteredClient(t *testing.T) {
	ca, _ := GenerateCA()

	var gotAuth string
	mux := http.NewServeMux()
	mux.HandleFunc("/api", func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.WriteHeader(http.StatusOK)
	})
	backendLn, backendAddr := startHTTPSBackend(t, ca, mux)
	defer backendLn.Close()
	withTrustedCA(t, ca)

	reg := NewRegistry()
	s := NewServer("127.0.0.1:0", ca, nil, nil, "", quiet, WithBindingResolver(reg.Lookup))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer s.Close()

	inj := NewResolvingInjector(ResolverFunc(func(ctx context.Context) ([]SecretConfig, error) {
		return []SecretConfig{{Placeholder: "dtn_secret_x", Value: "real-secret", Hosts: []string{"localhost"}}}, nil
	}), time.Minute, "dtn_secret_")
	reg.Register("sb-1", net.ParseIP("127.0.0.1"), NewBinding("sb-1", false, []string{"localhost"}, inj))

	client := proxyClient(proxyAddr, ca)
	req, _ := http.NewRequest("GET", fmt.Sprintf("https://%s/api", backendAddr), nil)
	req.Header.Set("Authorization", "Bearer dtn_secret_x")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()

	if gotAuth != "Bearer real-secret" {
		t.Fatalf("expected secret injected for registered client, backend saw %q", gotAuth)
	}
}

func TestMuxServer_CloseClientTerminatesTunnel(t *testing.T) {
	ca, _ := GenerateCA()
	reg := NewRegistry()
	reg.Register("sb-1", net.ParseIP("127.0.0.1"), NewBinding("sb-1", false, []string{"localhost"}, NewInjector(nil)))
	s := NewServer("127.0.0.1:0", ca, nil, nil, "", quiet, WithBindingResolver(reg.Lookup))
	addr, err := s.Start()
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer s.Close()

	conn, err := net.Dial("tcp", addr)
	if err != nil {
		t.Fatalf("dial failed: %v", err)
	}
	defer conn.Close()

	// Open a CONNECT tunnel and read the established response. The server then
	// blocks awaiting our TLS ClientHello, holding the (tracked) connection open.
	fmt.Fprintf(conn, "CONNECT localhost:443 HTTP/1.1\r\nHost: localhost:443\r\n\r\n")
	br := bufio.NewReader(conn)
	status, err := br.ReadString('\n')
	if err != nil || !strings.Contains(status, "200") {
		t.Fatalf("expected 200 Connection Established, got %q err=%v", status, err)
	}
	// Consume the rest of the CONNECT response headers (up to the blank line) so
	// the next read observes the server closing the connection, not buffered data.
	for {
		line, err := br.ReadString('\n')
		if err != nil {
			t.Fatalf("reading CONNECT response: %v", err)
		}
		if line == "\r\n" || line == "\n" {
			break
		}
	}

	// Revoking the client must drop the held tunnel, not just reject new ones.
	s.CloseClient(net.ParseIP("127.0.0.1"))

	conn.SetReadDeadline(time.Now().Add(2 * time.Second))
	if _, err := br.ReadString('\n'); err == nil {
		t.Fatal("expected tunnel to be closed after CloseClient")
	}
}

func TestMuxServer_RejectsUnregisteredClient(t *testing.T) {
	ca, _ := GenerateCA()
	reg := NewRegistry() // empty: no binding for any client
	s := NewServer("127.0.0.1:0", ca, nil, nil, "", quiet, WithBindingResolver(reg.Lookup))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("Start failed: %v", err)
	}
	defer s.Close()

	proxyURL, _ := url.Parse("http://" + proxyAddr)
	client := &http.Client{Transport: &http.Transport{Proxy: http.ProxyURL(proxyURL)}}
	resp, err := client.Get("http://anything.example/x")
	if err != nil {
		t.Fatalf("request failed: %v", err)
	}
	resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for unregistered client, got %d", resp.StatusCode)
	}
}
