package proxy

import (
	"bufio"
	"context"
	"crypto/subtle"
	"crypto/tls"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
	"time"
)

// Server is a MITM forward proxy that intercepts HTTPS connections,
// terminates TLS with per-host certs signed by an ephemeral CA,
// and injects real secret values in place of placeholders.
// It also enforces a domain allowlist — requests to non-allowed hosts are rejected.
//
// The policy applied to a connection (allow list + secret injector) is held in a
// Binding. By default every client shares one static binding (per-workload use).
// Set WithBindingResolver to run in shared mode, where the binding is chosen per
// connection from the client's IP — letting a single proxy serve many sandboxes,
// each with its own secrets and allow list.
type Server struct {
	ca              *CA
	static          *Binding              // applied to all clients unless bindingFor is set
	bindingFor      func(net.IP) *Binding // shared mode: resolve binding by client IP (nil → use static)
	allowedClientIP net.IP                // if set, only accept connections from this IP
	authToken       string                // if set, require Proxy-Authorization: Bearer <token>
	addr            string
	listener        net.Listener
	wg              sync.WaitGroup
	log             *slog.Logger

	// Connection limits (NL-REQ-02). idleTimeout reaps stalled/idle connections;
	// maxConns caps total concurrency; maxConnsPerIP caps a single client so one
	// tenant can't exhaust the shared proxy. Zero disables the corresponding cap.
	idleTimeout   time.Duration
	maxConns      int
	maxConnsPerIP int
	sem           chan struct{} // global concurrency cap (nil when maxConns == 0)
	ipConnMu      sync.Mutex
	ipConns       map[string]int // per-client-IP active connection counts

	// Active client connections, tracked so teardown can forcibly terminate them
	// (closing the listener alone leaves established tunnels forwarding/injecting).
	// Close() drops all of them; CloseClient(ip) drops one workload's — used so a
	// sandbox's tunnels stop immediately when its binding is removed (revocation).
	connMu  sync.Mutex
	conns   map[net.Conn]net.IP
	closing bool
}

// NewServer creates a new MITM proxy server.
// allowedDomains is the set of hostnames the proxy will forward to;
// requests to any other host are rejected with 403.
// Entries prefixed with "*." are treated as wildcard suffixes.
// allowedClientIP restricts access to a single client IP (empty = no restriction).
func NewServer(addr string, ca *CA, injector *Injector, allowedDomains []string, allowedClientIP string, opts ...Option) *Server {
	s := &Server{
		ca:            ca,
		static:        newBinding("", false, allowedDomains, injector),
		addr:          addr,
		conns:         make(map[net.Conn]net.IP),
		idleTimeout:   defaultIdleTimeout,
		maxConns:      defaultMaxConns,
		maxConnsPerIP: defaultMaxConnsPerIP,
		ipConns:       make(map[string]int),
	}
	if allowedClientIP != "" {
		s.allowedClientIP = net.ParseIP(allowedClientIP)
	}
	for _, o := range opts {
		o(s)
	}
	if s.log == nil {
		s.log = slog.Default()
	}
	if s.maxConns > 0 {
		s.sem = make(chan struct{}, s.maxConns)
	}
	return s
}

// Start begins listening for proxy connections. Non-blocking.
func (s *Server) Start() (string, error) {
	ln, err := net.Listen("tcp", s.addr)
	if err != nil {
		return "", fmt.Errorf("proxy listen: %w", err)
	}
	s.listener = ln
	actualAddr := ln.Addr().String()

	s.wg.Add(1)
	go func() {
		defer s.wg.Done()
		for {
			conn, err := ln.Accept()
			if err != nil {
				return // listener closed
			}
			remoteHost, _, _ := net.SplitHostPort(conn.RemoteAddr().String())
			if !s.acquireConn(remoteHost) {
				conn.Close() // over a concurrency cap; drop without serving
				continue
			}
			go func() {
				defer s.releaseConn(remoteHost)
				s.handleConn(conn)
			}()
		}
	}()

	s.log.Debug("MITM proxy started", "addr", actualAddr)
	return actualAddr, nil
}

// Close stops the proxy server and forcibly terminates any active connections
// (so established tunnels can't keep forwarding/injecting after teardown).
func (s *Server) Close() {
	if s.listener != nil {
		s.listener.Close()
	}
	s.connMu.Lock()
	s.closing = true
	for c := range s.conns {
		c.Close()
	}
	s.connMu.Unlock()
	s.wg.Wait()
}

// CloseClient terminates any active connections from the given client IP. Used
// to immediately drop a workload's tunnels when its secret binding is removed
// (sandbox destroyed or token rotated), so injection can't continue on an
// already-open tunnel.
func (s *Server) CloseClient(ip net.IP) {
	if ip == nil {
		return
	}
	s.connMu.Lock()
	for c, cip := range s.conns {
		if cip != nil && cip.Equal(ip) {
			c.Close()
		}
	}
	s.connMu.Unlock()
}

// trackConn registers an active connection. It returns false if the server is
// already closing, in which case the caller should drop the connection.
func (s *Server) trackConn(conn net.Conn, ip net.IP) bool {
	s.connMu.Lock()
	defer s.connMu.Unlock()
	if s.closing {
		return false
	}
	s.conns[conn] = ip
	return true
}

func (s *Server) untrackConn(conn net.Conn) {
	s.connMu.Lock()
	delete(s.conns, conn)
	s.connMu.Unlock()
}

func (s *Server) handleConn(conn net.Conn) {
	// Apply an idle timeout to every read/write (handshake, request parse, tunnel
	// loop, response streaming) so a stalled or idle connection is reaped instead
	// of pinning a goroutine + FD forever (NL-REQ-02).
	if s.idleTimeout > 0 {
		conn = &idleConn{Conn: conn, idle: s.idleTimeout}
	}
	defer conn.Close()

	remoteHost, _, _ := net.SplitHostPort(conn.RemoteAddr().String())
	remoteIP := net.ParseIP(remoteHost)

	if !s.trackConn(conn, remoteIP) {
		return // server is shutting down
	}
	defer s.untrackConn(conn)

	// Enforce client IP restriction (multitenancy isolation).
	if s.allowedClientIP != nil {
		if remoteIP == nil || !remoteIP.Equal(s.allowedClientIP) {
			s.log.Warn("proxy: rejected connection from unauthorized IP", "remote", remoteHost)
			return
		}
	}

	br := bufio.NewReader(conn)
	req, err := http.ReadRequest(br)
	if err != nil {
		s.log.Debug("proxy: failed to read request", "error", err)
		return
	}

	// Enforce Bearer token authentication.
	if s.authToken != "" {
		proxyAuth := req.Header.Get("Proxy-Authorization")
		valid := strings.HasPrefix(proxyAuth, "Bearer ") &&
			subtle.ConstantTimeCompare([]byte(proxyAuth[7:]), []byte(s.authToken)) == 1
		if !valid {
			s.log.Warn("proxy: rejected unauthenticated request", "remote", conn.RemoteAddr().String())
			conn.Write([]byte("HTTP/1.1 407 Proxy Authentication Required\r\nProxy-Authenticate: Bearer\r\n\r\n"))
			return
		}
		req.Header.Del("Proxy-Authorization")
	}

	// Resolve the policy binding for this connection. In shared mode an unknown
	// client (no binding for its IP) is rejected — it can't be mapped to a
	// sandbox, so we can't know its allow list or secrets.
	binding := s.static
	if s.bindingFor != nil {
		binding = s.bindingFor(remoteIP)
		if binding == nil {
			s.log.Warn("proxy: no binding for client; rejecting", "remote", remoteHost)
			conn.Write([]byte("HTTP/1.1 403 Forbidden\r\n\r\n"))
			return
		}
	}

	if req.Method == http.MethodConnect {
		s.handleConnect(conn, req, binding)
	} else {
		s.handleHTTP(conn, req, binding)
	}
}

// handleConnect handles HTTPS CONNECT tunneling with MITM.
func (s *Server) handleConnect(clientConn net.Conn, req *http.Request, binding *Binding) {
	host := req.Host
	hostname := stripPort(host)

	// Enforce domain allowlist.
	if !binding.isAllowed(hostname) {
		s.log.Warn("proxy: blocked connection to non-allowed host", "host", hostname, "binding", binding.name)
		clientConn.Write([]byte("HTTP/1.1 403 Forbidden\r\n\r\n"))
		return
	}

	// Resolve the upstream before completing the tunnel. The proxy — not the
	// client — performs DNS, so a host that doesn't resolve has to be reported as
	// a failed CONNECT (a non-2xx reply, before "200 Connection Established"). If
	// we established the tunnel first and only failed afterwards, the client would
	// see a successful connection and could not turn the failure into a non-zero
	// exit. Replying 502 to the CONNECT makes curl exit non-zero ("Received HTTP
	// code 502 from proxy after CONNECT") without exposing any proxy internals.
	if err := resolveHost(req.Context(), hostname); err != nil {
		s.log.Debug("proxy: upstream host did not resolve", "host", hostname, "error", err)
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}

	// Tell the client the tunnel is established.
	clientConn.Write([]byte("HTTP/1.1 200 Connection Established\r\n\r\n"))

	// TLS handshake with the client using a cert minted for this host.
	cert, err := s.ca.MintCert(hostname)
	if err != nil {
		s.log.Error("proxy: failed to mint cert", "host", hostname, "error", err)
		return
	}

	tlsConn := tls.Server(clientConn, &tls.Config{
		Certificates: []tls.Certificate{*cert},
	})
	if err := tlsConn.Handshake(); err != nil {
		s.log.Debug("proxy: TLS handshake failed", "host", hostname, "error", err)
		return
	}
	defer tlsConn.Close()

	// Read the actual HTTP request from the decrypted stream.
	clientReader := bufio.NewReader(tlsConn)

	for {
		innerReq, err := http.ReadRequest(clientReader)
		if err != nil {
			return // client done or error
		}

		// Set the full URL for the upstream request.
		innerReq.URL.Scheme = "https"
		innerReq.URL.Host = host
		innerReq.RequestURI = ""

		// Inject secrets into request headers.
		if binding.injector.HasSecrets() {
			s.injectHeaders(binding, hostname, innerReq)
		}

		// Inject secrets into request body.
		// TODO: Come back to this - we shouldn't load the entire body into memory
		// if innerReq.Body != nil && binding.injector.HasSecrets() {
		// 	body, err := io.ReadAll(innerReq.Body)
		// 	innerReq.Body.Close()
		// 	if err == nil {
		// 		replaced := binding.injector.ReplaceBody(hostname, body)
		// 		innerReq.Body = io.NopCloser(strings.NewReader(string(replaced)))
		// 		innerReq.ContentLength = int64(len(replaced))
		// 	}
		// }

		// Forward to the real upstream server.
		resp, err := http.DefaultTransport.(*http.Transport).RoundTrip(innerReq)
		if err != nil {
			// The tunnel is already up (the host resolved before we sent 200), so
			// the only channel left is the tunnel itself — a clean 502, which never
			// names the proxy. Resolution failures are caught before the 200 above.
			s.log.Debug("proxy: upstream request failed", "host", hostname, "error", err)
			writeUpstreamError(tlsConn, hostname)
			return
		}

		// Strip any real secret values back out of the response so the sandbox
		// only ever sees placeholders, even if the upstream echoes a secret back
		// (echo/debug routes, header-reflecting redirects, verbose 4xx) — NL-SEC-01.
		var repls []replacement
		if binding.injector.HasSecrets() {
			repls = binding.injector.responseReplacements(hostname)
		}

		// Stream the (scrubbed) response to the client; see writeResponse.
		if werr := writeResponse(tlsConn, resp, repls); werr != nil {
			s.log.Debug("proxy: writing response to client failed", "host", hostname, "error", werr)
			return
		}

		// If the client or server indicated close, stop.
		if resp.Close || innerReq.Close {
			return
		}
	}
}

// handleHTTP handles plain HTTP requests (non-CONNECT).
func (s *Server) handleHTTP(clientConn net.Conn, req *http.Request, binding *Binding) {
	hostname := stripPort(req.Host)

	// Enforce domain allowlist.
	if !binding.isAllowed(hostname) {
		s.log.Warn("proxy: blocked request to non-allowed host", "host", hostname, "binding", binding.name)
		clientConn.Write([]byte("HTTP/1.1 403 Forbidden\r\n\r\n"))
		return
	}

	// Do NOT inject secrets here: a non-CONNECT request is forwarded to an http://
	// upstream over cleartext, so the real value would cross the network in the
	// clear and be visible to anyone on-path (NL-SEC-02). Placeholders are
	// forwarded untouched (they're opaque and leak nothing); secret injection is
	// reserved for the TLS-terminated CONNECT path. Surface a warning when a
	// placeholder actually appears so a misconfiguration (or attempt to exfil a
	// secret over cleartext) is visible.
	if marker := binding.injector.Marker(); marker != "" && requestCarries(req, marker) {
		s.log.Warn("proxy: secret placeholder in a cleartext HTTP request; injection refused (use https)",
			"host", hostname, "binding", binding.name)
	}

	req.RequestURI = ""

	upstreamResp, err := http.DefaultTransport.RoundTrip(req)
	if err != nil {
		s.log.Debug("proxy: upstream request failed", "host", hostname, "error", err)
		if upstreamResolutionFailed(err) {
			// The host couldn't be resolved. We can't reproduce curl's own "could
			// not resolve host" (the proxy resolves, not the client), and a 502 body
			// would make curl exit 0. Dropping the connection makes curl fail with a
			// non-zero exit instead, with no proxy details in the error.
			return
		}
		writeUpstreamError(clientConn, hostname)
		return
	}

	// No injection happened on this path, so there is no injected secret to scrub
	// back out; stream the response as-is.
	if werr := writeResponse(clientConn, upstreamResp, nil); werr != nil {
		s.log.Debug("proxy: writing response to client failed", "host", hostname, "error", werr)
	}
}

// dnsResolveTimeout caps the pre-CONNECT upstream name lookup so a slow or
// unreachable resolver can't hang tunnel setup.
const dnsResolveTimeout = 10 * time.Second

// resolveHost looks up hostname through the same resolver the proxy's transport
// dials with (net.DefaultResolver, which honors the --dns override), so the
// pre-CONNECT check agrees with what the upstream request would do. An IP
// literal resolves to itself. It returns the lookup error (a *net.DNSError)
// when the host cannot be resolved.
func resolveHost(ctx context.Context, hostname string) error {
	if ctx == nil {
		ctx = context.Background()
	}
	ctx, cancel := context.WithTimeout(ctx, dnsResolveTimeout)
	defer cancel()
	_, err := net.DefaultResolver.LookupHost(ctx, hostname)
	return err
}

// upstreamResolutionFailed reports whether err (from an upstream RoundTrip) is a
// DNS name-resolution failure — the host could not be resolved — as opposed to a
// connection refused, timeout, or other transport error.
func upstreamResolutionFailed(err error) bool {
	var dnsErr *net.DNSError
	return errors.As(err, &dnsErr)
}

// writeUpstreamError writes a framed HTTP/1.1 502 to the client for an upstream
// failure that happens after the request is already committed (a CONNECT tunnel
// that's up, or a plain-HTTP request mid-flight). The body is generic and never
// names the proxy — the sandboxed client must not learn it is behind a MITM.
// Resolution failures are handled earlier (a failed CONNECT or a dropped HTTP
// connection) so the client gets a non-zero exit rather than this 502.
func writeUpstreamError(w io.Writer, hostname string) {
	body := fmt.Sprintf("could not reach upstream host: %s\r\n", hostname)
	fmt.Fprint(w, "HTTP/1.1 502 Bad Gateway\r\n")
	fmt.Fprint(w, "Content-Type: text/plain; charset=utf-8\r\n")
	fmt.Fprintf(w, "Content-Length: %d\r\n", len(body))
	fmt.Fprint(w, "Connection: close\r\n")
	fmt.Fprint(w, "\r\n")
	io.WriteString(w, body)
}

// writeResponse re-frames resp as HTTP/1.1 and streams it to w, never buffering
// the whole body (NL-REQ-01). When repls is non-empty the body is streamed
// through a scrubber that rewrites real secret values back to placeholders
// (NL-SEC-01); since that changes the body length, such responses are framed
// with chunked transfer-encoding. The upstream body is always closed.
func writeResponse(w io.Writer, resp *http.Response, repls []replacement) error {
	resp.Proto, resp.ProtoMajor, resp.ProtoMinor = "HTTP/1.1", 1, 1
	upstreamBody := resp.Body

	if len(repls) > 0 {
		scrubHeader(resp.Header, repls)
	}

	resp.Header.Del("Transfer-Encoding")
	switch {
	case len(repls) > 0:
		// Scrubbing rewrites the body, so its length is no longer known up front;
		// stream it chunked. Trailers are scrubbed in place by the reader once the
		// body reaches EOF (see scrubbingReader.trailer).
		sr := newScrubbingReader(upstreamBody, repls)
		sr.trailer = resp.Trailer
		resp.Body = sr
		resp.ContentLength = -1
		resp.TransferEncoding = []string{"chunked"}
		resp.Header.Del("Content-Length")
	case resp.ContentLength < 0:
		// Unknown length (e.g. an HTTP/2 origin) — chunked so the HTTP/1.1 client
		// can detect end-of-body.
		resp.TransferEncoding = []string{"chunked"}
		resp.Header.Del("Content-Length")
	default:
		resp.TransferEncoding = nil
	}

	err := resp.Write(w)
	// resp.Write closes resp.Body on success; close the original upstream body
	// directly too (idempotent) so a mid-stream write error can't leak it.
	upstreamBody.Close()
	return err
}

// requestCarries reports whether the request's URL or any header value contains
// marker — a cheap check for a secret placeholder (used only for a warning).
func requestCarries(req *http.Request, marker string) bool {
	if strings.Contains(req.URL.String(), marker) {
		return true
	}
	for _, vals := range req.Header {
		for _, v := range vals {
			if strings.Contains(v, marker) {
				return true
			}
		}
	}
	return false
}

// injectHeaders replaces placeholder values in request headers with real secrets.
func (s *Server) injectHeaders(binding *Binding, hostname string, req *http.Request) {
	for key, vals := range req.Header {
		for i, v := range vals {
			replaced := binding.injector.ReplaceString(hostname, v)
			if replaced != v {
				req.Header[key][i] = replaced
				s.log.Debug("proxy: injected secret in header", "host", hostname, "header", key, "binding", binding.name)
			}
		}
	}
}
