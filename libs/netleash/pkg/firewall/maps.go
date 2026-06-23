package firewall

import "github.com/cilium/ebpf"

// firewallMapsAccessor provides uniform access to eBPF maps regardless of
// whether they come from cgroup_skb or TC programs.
type firewallMapsAccessor struct {
	AllowedDomains   *ebpf.Map
	AllowedIps       *ebpf.Map
	AllowedWildcards *ebpf.Map
	InternalDNSZones *ebpf.Map
	Events           *ebpf.Map
}
