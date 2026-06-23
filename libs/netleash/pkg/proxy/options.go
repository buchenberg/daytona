package proxy

import "log/slog"

// Option configures a Server.
type Option func(*Server)

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
