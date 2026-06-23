package firewall

import (
	"encoding/binary"
	"fmt"
	"net"
	"strings"
)

// maxDNSNameLen must match MAX_DNS_NAME_LEN in bpf/firewall.c.
const maxDNSNameLen = 128

// domainToWireFormat converts a domain name to DNS wire format (lowercased, zero-padded).
// Example: "example.com" → \x07example\x03com\x00 (padded to maxDNSNameLen bytes).
func domainToWireFormat(domain string) ([maxDNSNameLen]byte, error) {
	var key [maxDNSNameLen]byte
	domain = strings.ToLower(strings.TrimSuffix(domain, "."))

	labels := strings.Split(domain, ".")
	offset := 0
	for _, label := range labels {
		if len(label) == 0 {
			return key, fmt.Errorf("empty label in domain %q", domain)
		}
		if len(label) > 63 {
			return key, fmt.Errorf("label too long in domain %q", domain)
		}
		if offset+1+len(label) >= maxDNSNameLen-1 {
			return key, fmt.Errorf("domain too long: %q", domain)
		}
		key[offset] = byte(len(label))
		offset++
		copy(key[offset:], []byte(label))
		offset += len(label)
	}
	key[offset] = 0 // Root label terminator
	return key, nil
}

// populateAllowedDomains seeds the eBPF allowed_domains and allowed_wildcards maps.
// Domains prefixed with "*." (e.g., "*.github.com") are stored as wildcard entries:
// the parent domain goes into allowed_wildcards for suffix matching, and also into
// allowed_domains so the base domain itself is allowed.
func (fw *Firewall) populateAllowedDomains() error {
	for _, domain := range fw.cfg.Domains {
		isWildcard := strings.HasPrefix(domain, "*.")
		baseDomain := domain
		if isWildcard {
			baseDomain = domain[2:] // strip "*."
		}

		wireKey, err := domainToWireFormat(baseDomain)
		if err != nil {
			return fmt.Errorf("converting domain %q to wire format: %w", domain, err)
		}

		var key firewallDnsNameKey
		for i := 0; i < len(wireKey); i++ {
			key.Name[i] = int8(wireKey[i])
		}

		if isWildcard {
			if err := fw.maps.AllowedWildcards.Put(key, uint8(1)); err != nil {
				return fmt.Errorf("adding wildcard %q to allowed_wildcards map: %w", domain, err)
			}
			fw.log.Debug("allowed wildcard domain in eBPF map", "domain", domain)
		}

		// Always add the base domain to exact match (covers both explicit and wildcard base).
		if err := fw.maps.AllowedDomains.Put(key, uint8(1)); err != nil {
			return fmt.Errorf("adding domain %q to allowed_domains map: %w", baseDomain, err)
		}
		fw.log.Debug("allowed domain in eBPF map", "domain", baseDomain)
	}
	return nil
}

// populateInternalDNSZones seeds the eBPF internal_dns_zones map. DNS queries
// whose name is a subdomain of one of these zones (e.g. "cluster.local") are
// passed through to the resolver by the egress program instead of being dropped,
// so Kubernetes search-domain expansion doesn't stall an allowed external
// lookup. Zones are stored in DNS wire format, matching the suffix the egress
// program derives by stripping labels from the queried name.
func (fw *Firewall) populateInternalDNSZones() error {
	if fw.maps.InternalDNSZones == nil {
		return nil
	}
	for _, zone := range fw.cfg.InternalDNSZones {
		zone = strings.TrimSpace(zone)
		zone = strings.TrimPrefix(zone, "*.")
		zone = strings.Trim(zone, ".")
		if zone == "" {
			continue
		}
		wireKey, err := domainToWireFormat(zone)
		if err != nil {
			return fmt.Errorf("converting internal DNS zone %q to wire format: %w", zone, err)
		}
		var key firewallDnsNameKey
		for i := 0; i < len(wireKey); i++ {
			key.Name[i] = int8(wireKey[i])
		}
		if err := fw.maps.InternalDNSZones.Put(key, uint8(1)); err != nil {
			return fmt.Errorf("adding internal DNS zone %q to map: %w", zone, err)
		}
		fw.log.Debug("allowed internal DNS zone in eBPF map", "zone", zone)
	}
	return nil
}

// maxExecPathLen must match MAX_PATH_LEN in bpf/firewall_lsm.c.
const maxExecPathLen = 256

// populateAllowedExecs seeds the LSM allowed_execs map with whitelisted binary paths.
func (fw *Firewall) populateAllowedExecs() error {
	if fw.lsmObjs == nil {
		return nil
	}
	for _, path := range fw.cfg.AllowedExecs {
		if len(path) >= maxExecPathLen {
			return fmt.Errorf("exec path too long (%d >= %d): %q", len(path), maxExecPathLen, path)
		}
		var key firewallLsmExecPathKey
		for i := 0; i < len(path); i++ {
			key.Path[i] = int8(path[i])
		}
		if err := fw.lsmObjs.AllowedExecs.Put(key, uint8(1)); err != nil {
			return fmt.Errorf("adding exec path %q to allowed_execs map: %w", path, err)
		}
		fw.log.Debug("allowed exec in eBPF map", "path", path)
	}
	return nil
}

// allowProxyIP adds the proxy's IP address to the allowed_ips map so cgroup
// traffic can reach it (needed when proxy runs on the Docker bridge gateway).
func (fw *Firewall) allowProxyIP() error {
	if fw.cfg.ProxyAddr == "" {
		return nil
	}
	host, _, err := net.SplitHostPort(fw.cfg.ProxyAddr)
	if err != nil {
		return nil
	}
	ip := net.ParseIP(host)
	if ip == nil {
		return nil
	}
	ip4 := ip.To4()
	if ip4 == nil {
		return nil
	}
	key := binary.LittleEndian.Uint32(ip4)
	if err := fw.maps.AllowedIps.Put(key, uint8(1)); err != nil {
		return fmt.Errorf("allowing proxy IP: %w", err)
	}
	fw.log.Debug("allowed proxy IP", "ip", ip4)
	return nil
}
