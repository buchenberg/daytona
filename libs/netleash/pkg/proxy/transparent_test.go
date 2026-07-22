package proxy

import (
	"bufio"
	"crypto/tls"
	"crypto/x509"
	"errors"
	"fmt"
	"io"
	"net"
	"net/http"
	"net/url"
	"testing"
	"time"
)

// startHTTPSBackendWithCA is like startHTTPSBackend but serves a cert signed by
// a caller-supplied CA (distinct from the proxy's), so a test can tell whether a
// connection was spliced (client sees this backend cert) or MITM'd (client sees
// the proxy's minted cert).
func startHTTPSBackendWithCA(t *testing.T, backendCA *CA, handler http.Handler) (net.Listener, string) {
	t.Helper()
	cert, err := backendCA.MintCert("localhost")
	if err != nil {
		t.Fatalf("MintCert for backend failed: %v", err)
	}
	ln, err := tls.Listen("tcp", "127.0.0.1:0", &tls.Config{Certificates: []tls.Certificate{*cert}})
	if err != nil {
		t.Fatalf("backend tls.Listen failed: %v", err)
	}
	go func() { _ = http.Serve(ln, handler) }()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	return ln, "localhost:" + port
}

// TestServer_CONNECT_SplicesWhenNoSecret proves that a CONNECT to an allowed
// host with no secret mapped is spliced end-to-end (not MITM'd): the client
// trusts only the backend's CA, so the request succeeds solely because it saw
// the backend's real certificate rather than a proxy-minted one.
func TestServer_CONNECT_SplicesWhenNoSecret(t *testing.T) {
	proxyCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA (proxy) failed: %v", err)
	}
	backendCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA (backend) failed: %v", err)
	}

	mux := http.NewServeMux()
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("pong"))
	})
	backendLn, backendAddr := startHTTPSBackendWithCA(t, backendCA, mux)
	defer backendLn.Close()

	// Injector holds a secret for a DIFFERENT host, so localhost has no secret and
	// must be spliced.
	inj := NewInjector([]SecretConfig{{
		Name: "K", Placeholder: "__ph__", Value: "real", Hosts: []string{"api.openai.com"},
	}})
	s := NewServer("127.0.0.1:0", proxyCA, inj, []string{"localhost"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	// Client trusts ONLY the backend CA — if the proxy MITM'd, TLS would fail.
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(backendCA.PEM)
	client := &http.Client{Transport: &http.Transport{
		Proxy:           httpProxyURL(proxyAddr),
		TLSClientConfig: &tls.Config{RootCAs: pool},
	}}

	resp, err := client.Get(fmt.Sprintf("https://%s/ping", backendAddr))
	if err != nil {
		t.Fatalf("spliced CONNECT request failed (was it MITM'd?): %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "pong" {
		t.Fatalf("expected 'pong', got %q", body)
	}
}

// TestServer_CONNECT_MITMsWhenSecret is the complement: when a secret targets the
// host, the proxy MITMs (client must trust the proxy CA, not the backend CA).
func TestServer_CONNECT_MITMsWhenSecret(t *testing.T) {
	proxyCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA (proxy) failed: %v", err)
	}
	backendCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA (backend) failed: %v", err)
	}

	var gotAuth string
	mux := http.NewServeMux()
	mux.HandleFunc("/ping", func(w http.ResponseWriter, r *http.Request) {
		gotAuth = r.Header.Get("Authorization")
		w.Write([]byte("pong"))
	})
	backendLn, backendAddr := startHTTPSBackendWithCA(t, backendCA, mux)
	defer backendLn.Close()

	// The proxy dials the backend upstream and must trust the backend's CA for
	// that leg.
	withTrustedCA(t, backendCA)

	inj := NewInjector([]SecretConfig{{
		Name: "K", Placeholder: "__ph__", Value: "sekret", Hosts: []string{"localhost"},
	}})
	s := NewServer("127.0.0.1:0", proxyCA, inj, []string{"localhost"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	// Client trusts ONLY the proxy CA — proving the connection was MITM'd.
	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(proxyCA.PEM)
	client := &http.Client{Transport: &http.Transport{
		Proxy:           httpProxyURL(proxyAddr),
		TLSClientConfig: &tls.Config{RootCAs: pool},
	}}

	req, _ := http.NewRequest(http.MethodGet, fmt.Sprintf("https://%s/ping", backendAddr), nil)
	req.Header.Set("Authorization", "Bearer __ph__")
	resp, err := client.Do(req)
	if err != nil {
		t.Fatalf("MITM CONNECT request failed: %v", err)
	}
	defer resp.Body.Close()
	if gotAuth != "Bearer sekret" {
		t.Fatalf("expected placeholder injected to 'Bearer sekret', backend saw %q", gotAuth)
	}
}

// TestServer_SpliceSurvivesIdleTimeout reproduces a long-poll through the
// proxy: the backend holds the response until well past the proxy's idle
// timeout while no bytes flow in either direction. The spliced tunnel must not
// be reaped — established tunnels are guarded by TCP keepalive, not the idle
// deadline — so the delayed response still reaches the client.
func TestServer_SpliceSurvivesIdleTimeout(t *testing.T) {
	proxyCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA (proxy) failed: %v", err)
	}
	backendCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA (backend) failed: %v", err)
	}

	const idle = 150 * time.Millisecond
	mux := http.NewServeMux()
	mux.HandleFunc("/slow", func(w http.ResponseWriter, r *http.Request) {
		time.Sleep(4 * idle) // hold the tunnel byte-idle well past the timeout
		w.Write([]byte("late"))
	})
	backendLn, backendAddr := startHTTPSBackendWithCA(t, backendCA, mux)
	defer backendLn.Close()

	s := NewServer("127.0.0.1:0", proxyCA, NewInjector(nil), []string{"localhost"}, "", quiet,
		WithIdleTimeout(idle))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	pool := x509.NewCertPool()
	pool.AppendCertsFromPEM(backendCA.PEM)
	client := &http.Client{Transport: &http.Transport{
		Proxy:           httpProxyURL(proxyAddr),
		TLSClientConfig: &tls.Config{RootCAs: pool},
	}}

	resp, err := client.Get(fmt.Sprintf("https://%s/slow", backendAddr))
	if err != nil {
		t.Fatalf("long-poll through a spliced tunnel failed (reaped by the idle timeout?): %v", err)
	}
	defer resp.Body.Close()
	body, _ := io.ReadAll(resp.Body)
	if string(body) != "late" {
		t.Fatalf("expected 'late', got %q", body)
	}
}

// TestServer_IdleTimeoutReapsSetupPhase pins the flip side: before a tunnel is
// established the idle timeout still applies, so a client that connects and
// sends nothing (a Slowloris opener) is reaped rather than held forever.
func TestServer_IdleTimeoutReapsSetupPhase(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"allowed.example"}, "", quiet,
		WithIdleTimeout(100*time.Millisecond))
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	raw, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial proxy failed: %v", err)
	}
	defer raw.Close()
	_ = raw.SetReadDeadline(time.Now().Add(2 * time.Second))
	// Send nothing; the proxy must close the connection at ~idleTimeout, seen
	// here as EOF well before our own 2s guard deadline.
	if _, err := raw.Read(make([]byte, 1)); !errors.Is(err, io.EOF) {
		t.Fatalf("expected the proxy to reap the idle connection (EOF), got: %v", err)
	}
}

// TestServer_TransparentTLS_BlockedHostDropped verifies the transparent path:
// a raw TLS ClientHello (no CONNECT) whose SNI is not allowed is dropped before
// any handshake, so the client's handshake fails.
func TestServer_TransparentTLS_BlockedHostDropped(t *testing.T) {
	proxyCA, err := GenerateCA()
	if err != nil {
		t.Fatalf("GenerateCA failed: %v", err)
	}
	s := NewServer("127.0.0.1:0", proxyCA, NewInjector(nil), []string{"allowed.example"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	raw, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial proxy failed: %v", err)
	}
	defer raw.Close()

	tc := tls.Client(raw, &tls.Config{ServerName: "evil.example", InsecureSkipVerify: true})
	_ = tc.SetDeadline(time.Now().Add(2 * time.Second))
	if err := tc.Handshake(); err == nil {
		t.Fatal("expected handshake to fail for a non-allowed SNI, but it succeeded")
	}
}

// TestServer_TransparentHTTP_OriginForm verifies a transparently-redirected
// cleartext request (origin-form target, Host header carries the destination)
// is forwarded to the host named in the Host header when allowed.
func TestServer_TransparentHTTP_OriginForm(t *testing.T) {
	mux := http.NewServeMux()
	mux.HandleFunc("/hi", func(w http.ResponseWriter, r *http.Request) {
		w.Write([]byte("hello"))
	})
	backend := &http.Server{Handler: mux}
	ln, err := net.Listen("tcp", "127.0.0.1:0")
	if err != nil {
		t.Fatalf("backend listen failed: %v", err)
	}
	defer ln.Close()
	go func() { _ = backend.Serve(ln) }()
	_, port, _ := net.SplitHostPort(ln.Addr().String())
	backendHost := "localhost:" + port

	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"localhost"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	body := transparentGET(t, proxyAddr, backendHost, "/hi")
	if body != "hello" {
		t.Fatalf("expected 'hello', got %q", body)
	}
}

// TestServer_TransparentHTTP_BlockedHost verifies an origin-form request to a
// non-allowed Host is dropped without any HTTP reply: the client dialed the
// destination directly (eBPF redirected it), so answering — even with a bare
// 403 — would reveal an HTTP-aware middlebox where a connection failure is
// expected. The client must see EOF, not a response.
func TestServer_TransparentHTTP_BlockedHost(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"allowed.example"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	raw, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial proxy failed: %v", err)
	}
	defer raw.Close()
	_ = raw.SetDeadline(time.Now().Add(2 * time.Second))
	fmt.Fprintf(raw, "GET /x HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n")
	resp, err := http.ReadResponse(bufio.NewReader(raw), nil)
	if err == nil {
		resp.Body.Close()
		t.Fatalf("expected the connection to be dropped for a blocked transparent host, got HTTP %d", resp.StatusCode)
	}
	if !errors.Is(err, io.EOF) && !errors.Is(err, io.ErrUnexpectedEOF) {
		t.Fatalf("expected EOF (dropped connection), got: %v", err)
	}
}

// TestServer_ExplicitHTTP_BlockedHost403 is the explicit-proxy counterpart: an
// absolute-form request (the client knowingly uses the proxy) to a non-allowed
// host still gets the protocol-correct 403.
func TestServer_ExplicitHTTP_BlockedHost403(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), []string{"allowed.example"}, "", quiet)
	proxyAddr, err := s.Start()
	if err != nil {
		t.Fatalf("proxy Start failed: %v", err)
	}
	defer s.Close()

	raw, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial proxy failed: %v", err)
	}
	defer raw.Close()
	_ = raw.SetDeadline(time.Now().Add(2 * time.Second))
	fmt.Fprintf(raw, "GET http://evil.example/x HTTP/1.1\r\nHost: evil.example\r\nConnection: close\r\n\r\n")
	resp, err := http.ReadResponse(bufio.NewReader(raw), nil)
	if err != nil {
		t.Fatalf("reading response failed: %v", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusForbidden {
		t.Fatalf("expected 403 for blocked host via explicit proxy, got %d", resp.StatusCode)
	}
}

// httpProxyURL builds a Proxy func for an http.Transport pointing at addr.
func httpProxyURL(addr string) func(*http.Request) (*url.URL, error) {
	u, _ := url.Parse("http://" + addr)
	return http.ProxyURL(u)
}

// transparentGET dials the proxy directly (simulating an eBPF-redirected socket)
// and issues an origin-form GET whose Host header names the destination, then
// returns the response body.
func transparentGET(t *testing.T, proxyAddr, host, path string) string {
	t.Helper()
	raw, err := net.DialTimeout("tcp", proxyAddr, 2*time.Second)
	if err != nil {
		t.Fatalf("dial proxy failed: %v", err)
	}
	defer raw.Close()
	_ = raw.SetDeadline(time.Now().Add(3 * time.Second))
	fmt.Fprintf(raw, "GET %s HTTP/1.1\r\nHost: %s\r\nConnection: close\r\n\r\n", path, host)
	resp, err := http.ReadResponse(bufio.NewReader(raw), nil)
	if err != nil {
		t.Fatalf("reading response failed: %v", err)
	}
	defer resp.Body.Close()
	b, _ := io.ReadAll(resp.Body)
	return string(b)
}
