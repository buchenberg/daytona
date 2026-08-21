package proxy

import (
	"log/slog"
	"net"
	"time"
)

// Option configures a Server.
type Option func(*Server)

// WithBindingResolver puts the server in shared (multiplexing) mode: instead of
// applying one static binding to every client, it resolves the Binding for each
// connection from the client's IP via fn (typically Registry.Lookup). A nil
// result rejects the connection. Use this to serve many sandboxes — each with
// its own secrets and allow list — from a single proxy.
func WithBindingResolver(fn func(net.IP) *Binding) Option {
	return func(s *Server) { s.bindingFor = fn }
}

// WithLogger sets the logger for the proxy server.
// If not provided, slog.Default() is used.
func WithLogger(l *slog.Logger) Option {
	return func(s *Server) { s.log = l }
}

// WithAuthToken requires clients to send a Proxy-Authorization: Bearer <token> header.
// If empty, no token authentication is enforced.
func WithAuthToken(token string) Option {
	return func(s *Server) { s.authToken = token }
}

// WithIdleTimeout overrides the per-connection idle timeout (NL-REQ-02). A
// connection with no read or write activity for this long is torn down. It
// covers a connection from accept until an end-to-end tunnel is established;
// a spliced tunnel is then guarded by TCP keepalive instead, so a byte-idle
// but alive tunnel (e.g. a long-poll) is not reaped. Zero disables the timeout.
func WithIdleTimeout(d time.Duration) Option {
	return func(s *Server) { s.idleTimeout = d }
}

// WithMaxConns overrides the cap on total concurrent connections (NL-REQ-02).
// Zero disables the global cap.
func WithMaxConns(n int) Option {
	return func(s *Server) { s.maxConns = n }
}

// WithMaxConnsPerIP overrides the cap on concurrent connections from a single
// client IP (NL-REQ-02), preventing one tenant from exhausting the shared
// proxy. Zero disables the per-IP cap.
func WithMaxConnsPerIP(n int) Option {
	return func(s *Server) { s.maxConnsPerIP = n }
}
