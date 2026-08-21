// Package secrets provides a SecretResolver that fetches the secrets available
// to a single Daytona sandbox from the Daytona API, for use by the netleash
// proxy's secret injector.
//
// A sandbox's environment is seeded with opaque placeholder tokens in place of
// real secret values (see the Daytona API's Secret entity). When the sandbox
// makes an outbound HTTP request, the netleash MITM proxy uses an APIResolver to
// look up which placeholders map to which real values for that sandbox — and to
// which hosts each secret may be sent — then swaps the placeholder for the real
// value only for approved hosts. The lookup authenticates as the sandbox itself,
// using the sandbox's auth token, so a sandbox can only ever resolve its own
// secrets.
package secrets

import (
	"context"
	"fmt"
	"net/http"

	apiclient "github.com/daytonaio/daytona/libs/api-client-go"
	"github.com/daytonaio/daytona/libs/netleash/pkg/proxy"
)

// DaytonaPlaceholderPrefix is the fixed prefix the Daytona API uses for the
// placeholder tokens it injects into a sandbox's environment in place of real
// secret values (see the Secret entity's `placeholder` column). Outbound request
// data that does not contain this prefix cannot reference a secret, so it serves
// as a cheap pre-check that lets the injector skip resolution entirely for
// requests that carry no placeholder.
const DaytonaPlaceholderPrefix = "dtn_secret_"

// APIResolver resolves the secrets available to one sandbox by calling the
// Daytona API, authenticating as that sandbox with its auth token. It implements
// proxy.SecretResolver.
type APIResolver struct {
	client    *apiclient.APIClient
	sandboxID string
}

// NewAPIResolver builds a resolver for a single sandbox.
//
//   - apiURL is the Daytona API base URL (e.g. "https://api.daytona.io").
//   - sandboxID is the sandbox whose secrets are resolved.
//   - secretsToken is the sandbox's dedicated secrets token; it is sent as a
//     bearer token so the API authorizes the request via the sandbox-secrets
//     auth context. This is distinct from the sandbox's auth token: only the
//     secrets token may resolve plaintext secret values, and it is held only by
//     the runner (never inside the sandbox).
func NewAPIResolver(apiURL, sandboxID, secretsToken string) *APIResolver {
	cfg := apiclient.NewConfiguration()
	cfg.Servers = apiclient.ServerConfigurations{{URL: apiURL}}
	cfg.AddDefaultHeader("Authorization", "Bearer "+secretsToken)
	cfg.AddDefaultHeader("X-Daytona-Source", "netleash")
	cfg.HTTPClient = &http.Client{}
	return &APIResolver{
		client:    apiclient.NewAPIClient(cfg),
		sandboxID: sandboxID,
	}
}

// Resolve fetches the sandbox's secrets and maps them to proxy.SecretConfig.
// An empty result (the sandbox has no secrets) is returned as a nil slice with a
// nil error.
func (r *APIResolver) Resolve(ctx context.Context) ([]proxy.SecretConfig, error) {
	resolved, _, err := r.client.SandboxAPI.ResolveSandboxSecrets(ctx, r.sandboxID).Execute()
	if err != nil {
		return nil, fmt.Errorf("resolving secrets for sandbox %s: %w", r.sandboxID, err)
	}

	if len(resolved) == 0 {
		return nil, nil
	}

	secrets := make([]proxy.SecretConfig, 0, len(resolved))
	for _, s := range resolved {
		placeholder := s.GetPlaceholder()
		value := s.GetValue()
		// A secret with no placeholder or no value can't be injected; skip it
		// rather than registering a no-op (or, worse, an empty-string match).
		if placeholder == "" || value == "" {
			continue
		}
		// The Daytona API documents an empty allowed-hosts list as unrestricted
		// ("Omit hosts entirely for unrestricted access"). Map it to the match-all
		// token so the injector substitutes the secret for every host, instead of
		// the injector's empty-list default of matching no host (which would leave
		// the placeholder unreplaced everywhere — a secret that silently never
		// works).
		hosts := s.GetHosts()
		if len(hosts) == 0 {
			hosts = []string{proxy.MatchAllHosts}
		}
		secrets = append(secrets, proxy.SecretConfig{
			Name:        s.GetEnv(),
			Placeholder: placeholder,
			Value:       value,
			Hosts:       hosts,
		})
	}
	return secrets, nil
}
