// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package netrules

import (
	"fmt"
	"strings"
)

// AntiSpoofChainPrefix prefixes the per-sandbox source-guard chains. It is
// deliberately distinct from ChainPrefix ("DAYTONA-SB-") so these chains never
// collide with the egress filter / limiter chains, which also live in the
// mangle table under the SB prefix.
const AntiSpoofChainPrefix = "DAYTONA-AS-"

// formatAntiSpoofChainName returns the source-guard chain name for a sandbox.
func formatAntiSpoofChainName(name string) string {
	if strings.HasPrefix(name, AntiSpoofChainPrefix) {
		return name
	}
	return AntiSpoofChainPrefix + name
}

// SetSourceGuard installs an anti-spoof rule for a sandbox: any IPv4 packet that
// enters the host through the sandbox's host veth with a source address other
// than the sandbox's assigned IP is dropped. This makes a sandbox's source IP
// unspoofable, which is what lets the shared secret-injection proxy safely
// identify a tenant by the connection's source IP. Without it a root sandbox
// (CAP_NET_ADMIN) can add a co-tenant's IP to its own interface, emit packets
// sourced as that co-tenant, and be handed the co-tenant's egress reach and
// real injected secrets (cross-tenant secret theft).
//
// The drop is anchored ONLY on the host veth (--physdev-in), the one fact a
// sandbox cannot forge from inside its namespace. It is never anchored on the
// source IP — anti-spoofing by trusting the very field being spoofed is
// circular — so a missing veth is a hard error, not a fallback. It lives in
// mangle/PREROUTING, which runs for both forwarded traffic and traffic locally
// delivered to the bridge gateway (where the proxy listens) — the same hook the
// egress limiter already relies on.
//
// It is idempotent: any previous jump for this sandbox (e.g. anchored on a stale
// veth from before a restart) is removed first, and the chain is rebuilt, so a
// changed IP or veth can't leave a stale allow behind.
func (manager *NetRulesManager) SetSourceGuard(name, assignedIP, vethName string) error {
	if vethName == "" {
		return fmt.Errorf("source guard requires the host veth (refusing to anchor anti-spoof on a spoofable source IP)")
	}
	if assignedIP == "" {
		return fmt.Errorf("source guard requires the sandbox's assigned IP")
	}

	chainName := formatAntiSpoofChainName(name)

	manager.mu.Lock()
	defer manager.mu.Unlock()

	// Create the chain (ignore "already exists").
	if err := manager.ipt.NewChain("mangle", chainName); err != nil && !strings.Contains(err.Error(), "Chain already exists") {
		return err
	}
	// Rebuild the chain from scratch so a changed assigned IP cannot leave a stale
	// allow behind. Packets sourced from the assigned IP RETURN (continue normal
	// processing); everything else hits the default DROP. Expressed as a positive
	// match + default drop (rather than a negated "! -s") so the rule does not
	// depend on negation handling.
	if err := manager.ipt.ClearChain("mangle", chainName); err != nil {
		return err
	}
	if err := manager.ipt.AppendUnique("mangle", chainName, "-s", assignedIP+"/32", "-j", "RETURN"); err != nil {
		return err
	}
	if err := manager.ipt.AppendUnique("mangle", chainName, "-j", "DROP"); err != nil {
		return err
	}

	// Re-point the PREROUTING jump at the current veth: drop any jumps from a
	// previous (possibly stale) veth first, then insert the fresh one at the top
	// so spoofed packets are dropped before any other PREROUTING processing.
	if err := manager.deletePreroutingJumps(chainName); err != nil {
		return err
	}
	return manager.ipt.InsertUnique("mangle", "PREROUTING", 1,
		"-m", "physdev", "--physdev-in", vethName, "-j", chainName)
}

// RemoveSourceGuard removes a sandbox's anti-spoof jump and chain. It finds the
// PREROUTING jump by chain name (so it needs neither the veth nor the IP, which
// may already be gone at teardown) and is a no-op when no guard exists.
func (manager *NetRulesManager) RemoveSourceGuard(name string) error {
	chainName := formatAntiSpoofChainName(name)

	manager.mu.Lock()
	defer manager.mu.Unlock()

	exists, err := manager.ipt.ChainExists("mangle", chainName)
	if err != nil {
		return err
	}
	if !exists {
		return nil
	}

	if err := manager.deletePreroutingJumps(chainName); err != nil {
		return err
	}
	return manager.ipt.ClearAndDeleteChain("mangle", chainName)
}

// HasSourceGuard reports whether a sandbox is fully guarded: both the
// per-sandbox chain AND a mangle/PREROUTING jump into it exist. The jump is what
// actually enforces the anti-spoof drop — an orphaned chain with no jump (e.g.
// PREROUTING was flushed, leaving the chain behind) protects nothing. Checking
// only the chain would let reconciliation treat such a sandbox as guarded and
// never repair the missing jump.
func (manager *NetRulesManager) HasSourceGuard(name string) (bool, error) {
	chainName := formatAntiSpoofChainName(name)
	manager.mu.Lock()
	defer manager.mu.Unlock()

	exists, err := manager.ipt.ChainExists("mangle", chainName)
	if err != nil {
		return false, err
	}
	if !exists {
		return false, nil
	}
	return manager.hasPreroutingJump(chainName)
}

// hasPreroutingJump reports whether mangle/PREROUTING contains a jump to
// chainName. Caller must hold manager.mu.
func (manager *NetRulesManager) hasPreroutingJump(chainName string) (bool, error) {
	rules, err := manager.ipt.List("mangle", "PREROUTING")
	if err != nil {
		return false, err
	}
	for _, rule := range rules {
		if strings.Contains(rule, chainName) {
			return true, nil
		}
	}
	return false, nil
}

// ListAntiSpoofChains returns all source-guard chains in the mangle table (used
// by reconciliation to garbage-collect chains whose sandbox is gone).
func (manager *NetRulesManager) ListAntiSpoofChains() ([]string, error) {
	manager.mu.Lock()
	defer manager.mu.Unlock()

	chains, err := manager.ipt.ListChains("mangle")
	if err != nil {
		return nil, err
	}
	var out []string
	for _, chain := range chains {
		if strings.HasPrefix(chain, AntiSpoofChainPrefix) {
			out = append(out, chain)
		}
	}
	return out, nil
}

// deletePreroutingJumps removes every mangle/PREROUTING rule that jumps to
// chainName. Caller must hold manager.mu.
func (manager *NetRulesManager) deletePreroutingJumps(chainName string) error {
	rules, err := manager.ipt.List("mangle", "PREROUTING")
	if err != nil {
		return err
	}
	for _, rule := range rules {
		if !strings.Contains(rule, chainName) {
			continue
		}
		args, err := ParseRuleArguments(rule)
		if err != nil {
			continue // skip malformed rules
		}
		if err := manager.ipt.Delete("mangle", "PREROUTING", args...); err != nil {
			return err
		}
	}
	return nil
}
