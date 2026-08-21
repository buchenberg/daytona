package runtime

import "context"

// Runtime abstracts container/VM-specific operations needed by netleash
// to attach a firewall and inject proxy configuration into a workload.
type Runtime interface {
	// ResolveCgroup returns the cgroup v2 filesystem path for the workload.
	ResolveCgroup(ctx context.Context, id string) (string, error)

	// GetIP returns the workload's IP address on its virtual network.
	GetIP(ctx context.Context, id string) (string, error)

	// GetGateway returns the gateway IP the workload uses to reach the host.
	GetGateway(ctx context.Context, id string) (string, error)

	// InjectEnv copies proxy config, CA certs, and secret placeholders into the workload.
	InjectEnv(ctx context.Context, id string, cfg EnvConfig) error

	// CleanupEnv removes injected files from the workload (best effort).
	CleanupEnv(ctx context.Context, id string)

	// Close releases runtime client resources.
	Close() error
}

// EnvConfig holds parameters for environment injection.
type EnvConfig struct {
	Secrets    []SecretEnv
	ProxyAddr  string
	CACertFile string // combined CA bundle (system CAs + ephemeral CA)
	RawCACert  string // just the ephemeral CA cert (for keytool)
}

// SecretEnv is a secret name and its placeholder value.
type SecretEnv struct {
	Name        string
	Placeholder string
}
