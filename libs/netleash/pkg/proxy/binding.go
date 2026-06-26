package proxy

import (
	"net"
	"strings"
	"sync"
)

// Binding is the per-client policy the proxy applies to a single connection: the
// set of hosts that may be reached and the secret Injector to apply to outbound
// requests. In the per-workload Server there is one static binding for every
// client; in the shared (multiplexing) Server a Registry maps each client IP to
// its own binding so one proxy can serve many sandboxes, each with its own
// secrets and allow list.
type Binding struct {
	// name identifies the binding in logs (e.g. the sandbox ID).
	name string

	// allowAll, when true, lets the binding reach any host — used for sandboxes
	// that have no domain allow list (unrestricted egress) but still need secret
	// injection. When false, only allowedDomains / wildcardSuffixes are reachable.
	allowAll         bool
	allowedDomains   map[string]bool
	wildcardSuffixes []string // e.g. ".github.com" for "*.github.com"

	injector *Injector
}

// newBinding builds a Binding from a domain allow list. Entries prefixed with
// "*." become wildcard suffixes (the base domain is allowed too). A nil injector
// is replaced with an empty one so callers never have to nil-check.
func newBinding(name string, allowAll bool, allowedDomains []string, injector *Injector) *Binding {
	allowed := make(map[string]bool, len(allowedDomains))
	var wildcards []string
	for _, d := range allowedDomains {
		d = strings.ToLower(strings.TrimSpace(d))
		if d == "" {
			continue
		}
		if strings.HasPrefix(d, "*.") {
			wildcards = append(wildcards, d[1:]) // "*.github.com" → ".github.com"
			allowed[d[2:]] = true                // also allow the base domain itself
		} else {
			allowed[d] = true
		}
	}
	if injector == nil {
		injector = NewInjector(nil)
	}
	return &Binding{
		name:             name,
		allowAll:         allowAll,
		allowedDomains:   allowed,
		wildcardSuffixes: wildcards,
		injector:         injector,
	}
}

// NewBinding creates a Binding for use with a Registry (shared proxy mode).
// name labels it in logs (e.g. a sandbox ID); allowAll lets it reach any host
// (for sandboxes with no domain allow list); otherwise allowedDomains is the
// allow list (with "*." wildcard support); injector supplies secret injection.
func NewBinding(name string, allowAll bool, allowedDomains []string, injector *Injector) *Binding {
	return newBinding(name, allowAll, allowedDomains, injector)
}

// isAllowed reports whether the binding permits reaching hostname, honoring
// allowAll and wildcard suffix matching.
func (b *Binding) isAllowed(hostname string) bool {
	if b.allowAll {
		return true
	}
	h := strings.ToLower(hostname)
	if b.allowedDomains[h] {
		return true
	}
	for _, suffix := range b.wildcardSuffixes {
		if strings.HasSuffix(h, suffix) {
			return true
		}
	}
	return false
}

// Registry maps a client (workload) IP to the Binding the shared proxy should
// apply to its connections. It is safe for concurrent use: the proxy looks up
// bindings on every connection while the runner registers/unregisters them as
// sandboxes come and go.
type Registry struct {
	mu     sync.RWMutex
	byIP   map[string]*Binding // key: net.IP.String()
	idToIP map[string]string   // sandbox ID → client IP string (for Unregister)
}

// NewRegistry creates an empty Registry.
func NewRegistry() *Registry {
	return &Registry{
		byIP:   make(map[string]*Binding),
		idToIP: make(map[string]string),
	}
}

// Register binds clientIP to b for the workload identified by id. Re-registering
// the same id (e.g. the sandbox restarted on a new IP) drops the old IP mapping
// first so a stale IP can't keep resolving to a removed sandbox.
func (r *Registry) Register(id string, clientIP net.IP, b *Binding) {
	r.mu.Lock()
	defer r.mu.Unlock()
	if oldIP, ok := r.idToIP[id]; ok && oldIP != clientIP.String() {
		delete(r.byIP, oldIP)
	}
	key := clientIP.String()
	r.byIP[key] = b
	r.idToIP[id] = key
}

// Unregister removes the binding for the workload id and returns the client IP
// it was bound to (nil if id was unknown), so the caller can terminate that
// client's active connections for immediate revocation. Safe when id is unknown.
func (r *Registry) Unregister(id string) net.IP {
	r.mu.Lock()
	defer r.mu.Unlock()
	ip, ok := r.idToIP[id]
	if !ok {
		return nil
	}
	delete(r.byIP, ip)
	delete(r.idToIP, id)
	return net.ParseIP(ip)
}

// Lookup returns the binding for clientIP, or nil if none is registered. It has
// the signature required by WithBindingResolver.
func (r *Registry) Lookup(clientIP net.IP) *Binding {
	if clientIP == nil {
		return nil
	}
	r.mu.RLock()
	defer r.mu.RUnlock()
	return r.byIP[clientIP.String()]
}

// Len returns the number of registered workloads.
func (r *Registry) Len() int {
	r.mu.RLock()
	defer r.mu.RUnlock()
	return len(r.idToIP)
}

// Has reports whether a binding is registered for workload id.
func (r *Registry) Has(id string) bool {
	r.mu.RLock()
	defer r.mu.RUnlock()
	_, ok := r.idToIP[id]
	return ok
}
