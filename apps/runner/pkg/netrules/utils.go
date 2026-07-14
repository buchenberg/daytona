package netrules

import (
	"fmt"
	"net"
	"strings"
)

const (
	// ChainPrefix is the prefix used for all Daytona sandbox chains
	ChainPrefix = "DAYTONA-SB-"
)

// ParseCidrNetworks parses a comma-separated list of CIDR networks and returns them as an array
func parseCidrNetworks(networks string) ([]*net.IPNet, error) {
	networkList := strings.Split(networks, ",")
	var cidrs []*net.IPNet

	for _, network := range networkList {
		trimmedNetwork := strings.TrimSpace(network)
		if trimmedNetwork == "" {
			continue
		}

		_, ipNet, err := net.ParseCIDR(trimmedNetwork)
		if err != nil {
			return nil, err
		}
		cidrs = append(cidrs, ipNet)
	}

	return cidrs, nil
}

// ParseRuleArguments parses an iptables rule string and returns the arguments
func ParseRuleArguments(rule string) ([]string, error) {
	// Remove the "-A CHAIN_NAME " prefix and split into arguments
	// Rule format: "-A DOCKER-USER -s 172.17.0.2/32 -j chain_name"
	if strings.HasPrefix(rule, "-A ") {
		// Find the first space after "-A CHAIN_NAME"
		parts := strings.SplitN(rule, " ", 3)
		if len(parts) >= 3 {
			return strings.Fields(parts[2]), nil
		}
	}
	return nil, fmt.Errorf("invalid rule format: %s", rule)
}

// formatChainName adds the DAYTONA-SB- prefix to a chain name if it doesn't already have it
func formatChainName(name string) string {
	if strings.HasPrefix(name, ChainPrefix) {
		return name
	}
	return ChainPrefix + name
}

// buildAnchor returns the iptables match spec that selects a sandbox's traffic
// for its per-sandbox chain.
//
// The preferred anchor is the container's host veth interface via the physdev
// match. The host veth lives in the host network namespace and cannot be
// renamed or moved from inside the sandbox, so it is unspoofable. Source IP is
// used only as a fallback when the veth cannot be resolved: a root sandbox with
// CAP_NET_ADMIN can add secondary in-subnet addresses to bypass a source-IP
// match (GHSA-fxgg-wfpj-frg3), so it is intentionally never combined with the
// veth match (combining them would re-open the bypass via an unmatched -s).
func buildAnchor(sourceIp, vethName string) []string {
	if vethName != "" {
		return []string{"-m", "physdev", "--physdev-in", vethName, "-p", "all"}
	}
	return []string{"-s", sourceIp, "-p", "all"}
}
