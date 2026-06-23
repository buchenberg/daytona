// Package manager provides a single, long-lived service that multiplexes many
// independent eBPF egress firewalls — one per workload (e.g. a sandbox
// container).
//
// The pkg/jail and pkg/firewall APIs are designed around a single jailed
// process or cgroup with its own eBPF program set. Manager keeps that one-jail
// building block but wraps it in a registry so a host process (such as the
// Daytona runner) can run a single netleash service for its whole lifetime and
// attach/detach domain allow lists per workload on demand, instead of spawning
// a separate netleash process per workload.
//
// Each managed workload gets its own firewall.Firewall attached to the
// workload's existing cgroup, with its own eBPF maps — so domain allow lists
// are fully isolated between workloads.
//
// Requires root or CAP_BPF. Linux only (cgroup v2 + eBPF).
package manager

import (
	"context"
	"fmt"
	"log/slog"
	"sort"
	"strings"
	"sync"

	"github.com/daytonaio/daytona/libs/netleash/pkg/firewall"
)

// Manager maintains per-workload egress firewalls keyed by an opaque workload
// ID. It is safe for concurrent use.
type Manager struct {
	log     *slog.Logger
	mu      sync.Mutex
	entries map[string]*entry

	// internalDNSZones are cluster-internal DNS zones (e.g. "cluster.local")
	// applied to every managed workload: queries for subdomains of these zones
	// are passed through to the resolver instead of dropped, so search-domain
	// expansion in Kubernetes doesn't stall lookups of allowed external domains.
	internalDNSZones []string
}

// entry tracks one active firewall and the configuration it was built from, so
// repeated Configure calls can detect no-ops and changes.
type entry struct {
	domains    []string // normalized + sorted; used to detect changes
	cgroupPath string
	fw         *firewall.Firewall
	cancel     context.CancelFunc
}

// New creates a Manager. If logger is nil, slog.Default() is used.
// internalDNSZones lists cluster-internal DNS zones (e.g. "cluster.local") whose
// queries are passed through to the resolver for every managed workload; pass
// nil to keep the strict behavior of dropping every non-allowed DNS query.
func New(logger *slog.Logger, internalDNSZones []string) *Manager {
	if logger == nil {
		logger = slog.Default()
	}
	return &Manager{
		log:              logger.With(slog.String("component", "netleash_manager")),
		entries:          make(map[string]*entry),
		internalDNSZones: internalDNSZones,
	}
}

// Configure ensures the workload identified by id has an egress firewall
// attached to cgroupPath that allows exactly the given domains (entries
// prefixed with "*." enable wildcard suffix matching). It is idempotent:
//
//   - empty domains  → any existing firewall is removed (unrestricted egress)
//   - same domains   → no-op (the working filter is left in place)
//   - changed domains → the firewall is rebuilt with the new allow list
//
// eBPF allow-list maps are additive, so the safe way to apply a changed list is
// to tear down and recreate the firewall rather than mutate it in place.
func (m *Manager) Configure(id, cgroupPath string, domains []string) error {
	norm := normalizeDomains(domains)

	m.mu.Lock()
	defer m.mu.Unlock()

	existing, ok := m.entries[id]

	// No domains → remove any existing restriction.
	if len(norm) == 0 {
		if ok {
			m.removeLocked(id, existing)
		}
		return nil
	}

	// Unchanged → leave the working filter untouched.
	if ok && existing.cgroupPath == cgroupPath && equalDomains(existing.domains, norm) {
		return nil
	}

	// New or changed: build and attach the NEW filter before retiring the old
	// one. Tearing the old filter down first would leave a window of fully
	// unrestricted egress while the new eBPF programs load and attach (which
	// takes a moment) — during which the workload could reach domains on neither
	// the old nor the new list. While both filters are attached to the cgroup
	// the kernel applies the intersection of their allow lists (a cgroup_skb
	// egress packet is dropped if any attached program denies it), so egress is
	// never more permissive mid-swap. It also keeps the old restriction in force
	// if Setup fails, rather than failing open.
	ctx, cancel := context.WithCancel(context.Background())
	// The firewall logs every egress decision (with the reason) on this
	// workload-scoped logger: blocked requests at warn, allowed/learned
	// requests at debug. See firewall.StartEventReader.
	fw := firewall.New(firewall.Config{
		Domains:          norm,
		InternalDNSZones: m.internalDNSZones,
		CgroupPath:       cgroupPath,
		Logger:           m.log.With(slog.String("workload", id)),
	})
	if err := fw.Setup(); err != nil {
		cancel()
		return fmt.Errorf("netleash: configuring workload %s: %w", id, err)
	}
	fw.StartEventReader(ctx)

	// New filter is live; now retire the old one (if any). Detaching it only
	// relaxes the intersection down to exactly the new allow list.
	if ok {
		existing.cancel()
		existing.fw.Cleanup()
	}

	m.entries[id] = &entry{
		domains:    norm,
		cgroupPath: cgroupPath,
		fw:         fw,
		cancel:     cancel,
	}
	m.log.Info("domain allow list applied", "workload", id, "domains", norm)
	return nil
}

// Remove tears down the firewall for the workload, restoring unrestricted
// egress. Safe to call when no firewall exists for id.
func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.entries[id]; ok {
		m.removeLocked(id, e)
	}
}

// removeLocked tears down a single entry. Caller must hold m.mu.
func (m *Manager) removeLocked(id string, e *entry) {
	e.cancel()
	e.fw.Cleanup()
	delete(m.entries, id)
	m.log.Info("domain allow list removed", "workload", id)
}

// Close tears down every managed firewall. After Close the Manager can still be
// reused (entries map is left ready for new Configure calls).
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, e := range m.entries {
		e.cancel()
		e.fw.Cleanup()
		delete(m.entries, id)
	}
}

// normalizeDomains trims, lowercases, de-duplicates and sorts the input,
// dropping empty entries. Sorting makes equalDomains order-independent.
func normalizeDomains(domains []string) []string {
	seen := make(map[string]struct{}, len(domains))
	out := make([]string, 0, len(domains))
	for _, d := range domains {
		d = strings.ToLower(strings.TrimSpace(d))
		if d == "" {
			continue
		}
		if _, dup := seen[d]; dup {
			continue
		}
		seen[d] = struct{}{}
		out = append(out, d)
	}
	sort.Strings(out)
	return out
}

// equalDomains reports whether two normalized (sorted) domain lists are equal.
func equalDomains(a, b []string) bool {
	if len(a) != len(b) {
		return false
	}
	for i := range a {
		if a[i] != b[i] {
			return false
		}
	}
	return true
}
