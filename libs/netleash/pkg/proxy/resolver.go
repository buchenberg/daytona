package proxy

import "context"

// SecretResolver supplies the set of secrets currently available to a workload.
//
// An Injector uses it to map placeholder tokens found in a workload's outbound
// requests back to their real values. Unlike the static secret list, a resolver
// lets the secrets be discovered at request time — e.g. fetched from the Daytona
// API for a specific sandbox, authenticating as that sandbox. Implementations
// may do network I/O and should honor the supplied context's deadline; the
// Injector caches the result so Resolve is called at most once per cache window
// per workload rather than on every request.
type SecretResolver interface {
	Resolve(ctx context.Context) ([]SecretConfig, error)
}

// ResolverFunc adapts an ordinary function to a SecretResolver.
type ResolverFunc func(ctx context.Context) ([]SecretConfig, error)

// Resolve calls f.
func (f ResolverFunc) Resolve(ctx context.Context) ([]SecretConfig, error) { return f(ctx) }
