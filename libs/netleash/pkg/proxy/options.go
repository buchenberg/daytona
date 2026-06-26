package proxy

import (
	"log/slog"
	"net"
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
