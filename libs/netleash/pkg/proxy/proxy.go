package proxy

import (
	"bufio"
	"bytes"
	"crypto/subtle"
	"crypto/tls"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/http"
	"strings"
	"sync"
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
		ca:     ca,
		static: newBinding("", false, allowedDomains, injector),
		addr:   addr,
		conns:  make(map[net.Conn]net.IP),
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
			go s.handleConn(conn)
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
			s.log.Debug("proxy: upstream request failed", "host", hostname, "error", err)
			tlsConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
			return
		}

		// Buffer the response body and force HTTP/1.1 framing.
		// Upstream may respond via HTTP/2 which lacks Content-Length and
		// chunked encoding; writing that verbatim leaves the client unable
		// to detect end-of-body.
		respBody, err := io.ReadAll(resp.Body)
		resp.Body.Close()
		if err != nil {
			tlsConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
			return
		}
		resp.Proto = "HTTP/1.1"
		resp.ProtoMajor = 1
		resp.ProtoMinor = 1
		resp.Body = io.NopCloser(bytes.NewReader(respBody))
		resp.ContentLength = int64(len(respBody))
		resp.TransferEncoding = nil
		resp.Write(tlsConn)

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

	// Inject secrets into headers.
	if binding.injector.HasSecrets() {
		s.injectHeaders(binding, hostname, req)
	}

	// Inject secrets into body.
	if req.Body != nil && binding.injector.HasSecrets() {
		body, err := io.ReadAll(req.Body)
		req.Body.Close()
		if err == nil {
			replaced := binding.injector.ReplaceBody(hostname, body)
			req.Body = io.NopCloser(strings.NewReader(string(replaced)))
			req.ContentLength = int64(len(replaced))
		}
	}

	req.RequestURI = ""

	upstreamResp, err := http.DefaultTransport.RoundTrip(req)
	if err != nil {
		clientConn.Write([]byte("HTTP/1.1 502 Bad Gateway\r\n\r\n"))
		return
	}
	defer upstreamResp.Body.Close()

	upstreamResp.Write(clientConn)
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
