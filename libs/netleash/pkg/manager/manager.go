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
	"os"
	"path/filepath"
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

	// pinRoot is the bpffs directory under which each workload's eBPF links and
	// maps are pinned (one subdir per workload ID). Pinning keeps the egress
	// filter attached across a restart of this process so domain filtering is
	// never lost mid-update; Adopt re-attaches management on startup. Empty
	// disables pinning (e.g. where bpffs isn't persistent across restarts).
	pinRoot string
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
// pinRoot is the bpffs directory under which per-workload eBPF objects are
// pinned so filters survive a restart of this process (e.g.
// "/sys/fs/bpf/netleash"); pass "" to disable pinning.
func New(logger *slog.Logger, internalDNSZones []string, pinRoot string) *Manager {
	if logger == nil {
		logger = slog.Default()
	}
	return &Manager{
		log:              logger.With(slog.String("component", "netleash_manager")),
		entries:          make(map[string]*entry),
		internalDNSZones: internalDNSZones,
		pinRoot:          pinRoot,
	}
}

// pinPathFor returns the bpffs pin directory for a workload, or "" if pinning
// is disabled.
func (m *Manager) pinPathFor(id string) string {
	if m.pinRoot == "" {
		return ""
	}
	return filepath.Join(m.pinRoot, id)
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
		fw.Cleanup() // detach the partially-attached new filter; leave the old one in force
		cancel()
		return fmt.Errorf("netleash: configuring workload %s: %w", id, err)
	}
	fw.StartEventReader(ctx)

	// New filter is live; now retire the old one (if any). Detaching it removes
	// its bpffs pins and relaxes the intersection down to exactly the new allow
	// list. Done before pinning the new one so they don't collide on the pin path.
	if ok {
		existing.cancel()
		existing.fw.Detach()
	}

	// Pin the new filter so it survives a restart of this process (zero gap).
	// Pinning failure is non-fatal: the filter is attached and enforcing now; it
	// just won't survive a restart. Pin is atomic — on failure it rolls back any
	// partial pins, so no half-pinned (un-adoptable) state is left behind — and a
	// later network-settings change re-applies and re-pins the filter.
	if pinPath := m.pinPathFor(id); pinPath != "" {
		if err := fw.Pin(pinPath); err != nil {
			m.log.Error("netleash: failed to pin firewall; filter active but won't survive a restart",
				"workload", id, "error", err)
		}
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

// Adopt re-attaches management to a workload whose pinned firewall survived a
// restart of this process — the eBPF programs stayed attached to the cgroup the
// whole time (zero gap), so this only restores the userspace handles and event
// reader. The pinned maps remain the source of truth for the live allow list,
// so the caller needs no record of the domains or cgroup. No-op if already
// managed. A later Configure (e.g. a network-settings change) rebuilds the
// filter from the new desired list regardless of what was adopted.
func (m *Manager) Adopt(id string) error {
	pinPath := m.pinPathFor(id)
	if pinPath == "" {
		return fmt.Errorf("netleash: adopt requires pinning to be enabled")
	}

	m.mu.Lock()
	defer m.mu.Unlock()

	if _, ok := m.entries[id]; ok {
		return nil
	}

	ctx, cancel := context.WithCancel(context.Background())
	fw := firewall.New(firewall.Config{
		PinPath: pinPath,
		Logger:  m.log.With(slog.String("workload", id)),
	})
	if err := fw.Adopt(); err != nil {
		cancel()
		return fmt.Errorf("netleash: adopting workload %s: %w", id, err)
	}
	fw.StartEventReader(ctx)

	// domains/cgroupPath are intentionally left zero: the live allow list lives
	// in the adopted pinned maps, not in this record.
	m.entries[id] = &entry{
		fw:     fw,
		cancel: cancel,
	}
	m.log.Info("domain allow list adopted after restart", "workload", id)
	return nil
}

// PinnedWorkloads returns the workload IDs that have a pinned firewall on bpffs,
// i.e. filters that were active before this process started. Used on startup to
// adopt them (if the workload still exists) or tear them down (if it's gone).
// Returns nil when pinning is disabled.
func (m *Manager) PinnedWorkloads() ([]string, error) {
	if m.pinRoot == "" {
		return nil, nil
	}
	dirents, err := os.ReadDir(m.pinRoot)
	if err != nil {
		if os.IsNotExist(err) {
			return nil, nil
		}
		return nil, err
	}
	ids := make([]string, 0, len(dirents))
	for _, de := range dirents {
		if de.IsDir() {
			ids = append(ids, de.Name())
		}
	}
	return ids, nil
}

// IsManaged reports whether the workload currently has a live firewall entry.
func (m *Manager) IsManaged(id string) bool {
	m.mu.Lock()
	defer m.mu.Unlock()
	_, ok := m.entries[id]
	return ok
}

// Remove tears down the firewall for the workload, restoring unrestricted
// egress and removing its bpffs pins. Safe to call when no firewall exists for
// id; in that case it still clears any orphaned pins left by a previous process
// (e.g. the workload was removed while this process was down).
func (m *Manager) Remove(id string) {
	m.mu.Lock()
	defer m.mu.Unlock()
	if e, ok := m.entries[id]; ok {
		m.removeLocked(id, e)
		return
	}
	if pinPath := m.pinPathFor(id); pinPath != "" {
		if err := os.RemoveAll(pinPath); err != nil && !os.IsNotExist(err) {
			m.log.Warn("netleash: failed to remove orphaned pin dir", "workload", id, "error", err)
		}
	}
}

// removeLocked tears down a single entry. Caller must hold m.mu.
func (m *Manager) removeLocked(id string, e *entry) {
	e.cancel()
	e.fw.Detach() // unpins the bpffs dir and detaches the eBPF programs
	delete(m.entries, id)
	m.log.Info("domain allow list removed", "workload", id)
}

// Close releases this process's handles to every managed firewall but LEAVES
// the bpffs pins in place, so the egress filters keep enforcing uninterrupted
// across a restart of this process (zero gap). On startup the next process
// calls PinnedWorkloads + Adopt to resume managing them. To actually tear a
// filter down, use Remove. After Close the Manager can be reused.
func (m *Manager) Close() {
	m.mu.Lock()
	defer m.mu.Unlock()
	for id, e := range m.entries {
		e.cancel()
		e.fw.Cleanup() // keeps pins → filter stays attached
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
