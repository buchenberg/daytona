package netrules

import "strings"

// SetNetworkRules creates and configures network rules for a container.
//
// vethName is the container's host veth and is the preferred (unspoofable)
// anchor for the DOCKER-USER jump rule; sourceIp is used only as a fallback when
// the veth cannot be resolved. See buildAnchor.
func (manager *NetRulesManager) SetNetworkRules(name string, sourceIp string, vethName string, networkAllowList string) error {
	// Parse the allowed networks
	allowedNetworks, err := parseCidrNetworks(networkAllowList)
	if err != nil {
		return err
	}

	// Add prefix to chain name
	chainName := formatChainName(name)

	manager.mu.Lock()
	defer manager.mu.Unlock()

	// Create the chain (ignores if already exists)
	err = manager.ipt.NewChain("filter", chainName)
	if err != nil && !strings.Contains(err.Error(), "Chain already exists") {
		return err
	}

	// Clear existing rules to ensure clean state
	if err := manager.ipt.ClearChain("filter", chainName); err != nil {
		return err
	}

	// Add rules to allow traffic from the specified networks
	for _, network := range allowedNetworks {
		if err := manager.ipt.AppendUnique("filter", chainName, "-j", "RETURN", "-d", network.String(), "-p", "all"); err != nil {
			return err
		}
	}

	// Reject (not DROP) all other traffic so blocked connections fail fast
	// inside the sandbox instead of hanging in SYN retransmits until the stack
	// times out. TCP gets a RST so blocked connects surface as "connection
	// refused", which clients handle gracefully; everything else gets an ICMP
	// port-unreachable. The reject responses are safe to emit because the
	// per-sandbox source guard (SetSourceGuard) already prevents source-IP
	// spoofing, so they cannot be reflected at a forged address.
	if err := manager.ipt.AppendUnique("filter", chainName, "-p", "tcp", "-j", "REJECT", "--reject-with", "tcp-reset"); err != nil {
		return err
	}
	if err := manager.ipt.AppendUnique("filter", chainName, "-j", "REJECT", "--reject-with", "icmp-port-unreachable"); err != nil {
		return err
	}

	// Assign the rules to the container (atomic within the same mutex).
	// Anchor on the host veth when available so secondary in-subnet IPs added
	// inside the sandbox cannot escape this chain.
	rulespec := append(buildAnchor(sourceIp, vethName), "-j", chainName)
	if err := manager.ipt.InsertUnique("filter", "DOCKER-USER", 1, rulespec...); err != nil {
		return err
	}

	return nil
}
