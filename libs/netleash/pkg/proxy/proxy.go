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
type Server struct {
	ca               *CA
	injector         *Injector
	allowedDomains   map[string]bool
	wildcardSuffixes []string // e.g., ".github.com" for "*.github.com"
	allowedClientIP  net.IP   // if set, only accept connections from this IP
	authToken        string   // if set, require Proxy-Authorization: Bearer <token>
	addr             string
	listener         net.Listener
	wg               sync.WaitGroup
	log              *slog.Logger
}

// NewServer creates a new MITM proxy server.
// allowedDomains is the set of hostnames the proxy will forward to;
// requests to any other host are rejected with 403.
// Entries prefixed with "*." are treated as wildcard suffixes.
// allowedClientIP restricts access to a single client IP (empty = no restriction).
func NewServer(addr string, ca *CA, injector *Injector, allowedDomains []string, allowedClientIP string, opts ...Option) *Server {
	allowed := make(map[string]bool, len(allowedDomains))
	var wildcards []string
	for _, d := range allowedDomains {
		d = strings.ToLower(d)
		if strings.HasPrefix(d, "*.") {
			base := d[1:] // "*.github.com" → ".github.com"
			wildcards = append(wildcards, base)
			allowed[d[2:]] = true // also allow the base domain itself
		} else {
			allowed[d] = true
		}
	}
	var clientIP net.IP
	if allowedClientIP != "" {
		clientIP = net.ParseIP(allowedClientIP)
	}
	s := &Server{
		ca:               ca,
		injector:         injector,
		allowedDomains:   allowed,
		wildcardSuffixes: wildcards,
		allowedClientIP:  clientIP,
		addr:             addr,
	}
	for _, o := range opts {
		o(s)
	}
	if s.log == nil {
		s.log = slog.Default()
	}
	return s
}

// isAllowed checks if the given hostname is in the domain allowlist,
// including wildcard suffix matching.
func (s *Server) isAllowed(hostname string) bool {
	h := strings.ToLower(hostname)
	if s.allowedDomains[h] {
		return true
	}
	for _, suffix := range s.wildcardSuffixes {
		if strings.HasSuffix(h, suffix) {
			return true
		}
	}
	return false
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

// Close stops the proxy server.
func (s *Server) Close() {
	if s.listener != nil {
		s.listener.Close()
	}
	s.wg.Wait()
}

func (s *Server) handleConn(conn net.Conn) {
	defer conn.Close()

	// Enforce client IP restriction (multitenancy isolation).
	if s.allowedClientIP != nil {
		remoteHost, _, _ := net.SplitHostPort(conn.RemoteAddr().String())
		remoteIP := net.ParseIP(remoteHost)
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

	if req.Method == http.MethodConnect {
		s.handleConnect(conn, req)
	} else {
		s.handleHTTP(conn, req)
	}
}

// handleConnect handles HTTPS CONNECT tunneling with MITM.
func (s *Server) handleConnect(clientConn net.Conn, req *http.Request) {
	host := req.Host
	hostname := stripPort(host)

	// Enforce domain allowlist.
	if !s.isAllowed(hostname) {
		s.log.Warn("proxy: blocked connection to non-allowed host", "host", hostname)
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
		if s.injector.HasSecrets() {
			s.injectHeaders(hostname, innerReq)
		}

		// Inject secrets into request body.
		if innerReq.Body != nil && s.injector.HasSecrets() {
			body, err := io.ReadAll(innerReq.Body)
			innerReq.Body.Close()
			if err == nil {
				replaced := s.injector.ReplaceBody(hostname, body)
				innerReq.Body = io.NopCloser(strings.NewReader(string(replaced)))
				innerReq.ContentLength = int64(len(replaced))
			}
		}

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
func (s *Server) handleHTTP(clientConn net.Conn, req *http.Request) {
	hostname := stripPort(req.Host)

	// Enforce domain allowlist.
	if !s.isAllowed(hostname) {
		s.log.Warn("proxy: blocked request to non-allowed host", "host", hostname)
		clientConn.Write([]byte("HTTP/1.1 403 Forbidden\r\n\r\n"))
		return
	}

	// Inject secrets into headers.
	if s.injector.HasSecrets() {
		s.injectHeaders(hostname, req)
	}

	// Inject secrets into body.
	if req.Body != nil && s.injector.HasSecrets() {
		body, err := io.ReadAll(req.Body)
		req.Body.Close()
		if err == nil {
			replaced := s.injector.ReplaceBody(hostname, body)
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
func (s *Server) injectHeaders(hostname string, req *http.Request) {
	for key, vals := range req.Header {
		for i, v := range vals {
			replaced := s.injector.ReplaceString(hostname, v)
			if replaced != v {
				req.Header[key][i] = replaced
				s.log.Debug("proxy: injected secret in header", "host", hostname, "header", key)
			}
		}
	}
}
