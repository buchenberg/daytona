package firewall

import (
	"strings"
	"testing"
)

func TestDomainToWireFormat_Simple(t *testing.T) {
	got, err := domainToWireFormat("example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	// Expected: \x07example\x03com\x00 (length-prefixed labels + root terminator)
	want := []byte{7, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 3, 'c', 'o', 'm', 0}
	for i, b := range want {
		if got[i] != b {
			t.Fatalf("byte %d: got %d, want %d", i, got[i], b)
		}
	}

	// Rest should be zero-padded.
	for i := len(want); i < maxDNSNameLen; i++ {
		if got[i] != 0 {
			t.Fatalf("byte %d should be 0, got %d", i, got[i])
		}
	}
}

func TestDomainToWireFormat_Subdomain(t *testing.T) {
	got, err := domainToWireFormat("api.github.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []byte{3, 'a', 'p', 'i', 6, 'g', 'i', 't', 'h', 'u', 'b', 3, 'c', 'o', 'm', 0}
	for i, b := range want {
		if got[i] != b {
			t.Fatalf("byte %d: got %d, want %d", i, got[i], b)
		}
	}
}

func TestDomainToWireFormat_Lowercased(t *testing.T) {
	got, err := domainToWireFormat("Example.COM")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []byte{7, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 3, 'c', 'o', 'm', 0}
	for i, b := range want {
		if got[i] != b {
			t.Fatalf("byte %d: got %d (%c), want %d (%c)", i, got[i], got[i], b, b)
		}
	}
}

func TestDomainToWireFormat_TrailingDot(t *testing.T) {
	// FQDN with trailing dot should be stripped.
	got, err := domainToWireFormat("example.com.")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []byte{7, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 3, 'c', 'o', 'm', 0}
	for i, b := range want {
		if got[i] != b {
			t.Fatalf("byte %d: got %d, want %d", i, got[i], b)
		}
	}
}

func TestDomainToWireFormat_SingleLabel(t *testing.T) {
	got, err := domainToWireFormat("localhost")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []byte{9, 'l', 'o', 'c', 'a', 'l', 'h', 'o', 's', 't', 0}
	for i, b := range want {
		if got[i] != b {
			t.Fatalf("byte %d: got %d, want %d", i, got[i], b)
		}
	}
}

func TestDomainToWireFormat_EmptyLabel(t *testing.T) {
	_, err := domainToWireFormat("example..com")
	if err == nil {
		t.Fatal("expected error for empty label")
	}
	if !strings.Contains(err.Error(), "empty label") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDomainToWireFormat_LabelTooLong(t *testing.T) {
	long := strings.Repeat("a", 64) + ".com"
	_, err := domainToWireFormat(long)
	if err == nil {
		t.Fatal("expected error for label > 63 bytes")
	}
	if !strings.Contains(err.Error(), "label too long") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDomainToWireFormat_LabelMaxLength(t *testing.T) {
	// 63-byte label should be fine.
	label := strings.Repeat("a", 63)
	_, err := domainToWireFormat(label + ".com")
	if err != nil {
		t.Fatalf("63-byte label should be valid: %v", err)
	}
}

func TestDomainToWireFormat_DomainTooLong(t *testing.T) {
	// Build a domain that exceeds maxDNSNameLen (128 bytes) in wire format.
	// Each "aa." label takes 3 bytes in wire format (1 length + 2 chars).
	// 43 labels × 3 bytes = 129 bytes, which exceeds 128-byte buffer.
	labels := make([]string, 43)
	for i := range labels {
		labels[i] = "aa"
	}
	domain := strings.Join(labels, ".")

	_, err := domainToWireFormat(domain)
	if err == nil {
		t.Fatal("expected error for domain exceeding wire format limit")
	}
	if !strings.Contains(err.Error(), "domain too long") {
		t.Fatalf("unexpected error: %v", err)
	}
}

func TestDomainToWireFormat_DeepSubdomain(t *testing.T) {
	got, err := domainToWireFormat("a.b.c.d.example.com")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	want := []byte{1, 'a', 1, 'b', 1, 'c', 1, 'd', 7, 'e', 'x', 'a', 'm', 'p', 'l', 'e', 3, 'c', 'o', 'm', 0}
	for i, b := range want {
		if got[i] != b {
			t.Fatalf("byte %d: got %d, want %d", i, got[i], b)
		}
	}
}

func TestParseIPv4Port(t *testing.T) {
	ip, port, err := parseIPv4Port("172.20.0.1:18080")
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if ip.String() != "172.20.0.1" || port != 18080 {
		t.Fatalf("got %s:%d, want 172.20.0.1:18080", ip, port)
	}

	for _, bad := range []string{
		"",                  // empty
		"172.20.0.1",        // no port
		"proxy.local:8080",  // hostname, not IP
		"[::1]:8080",        // IPv6
		"172.20.0.1:0",      // zero port
		"172.20.0.1:notnum", // non-numeric port
	} {
		if _, _, err := parseIPv4Port(bad); err == nil {
			t.Errorf("parseIPv4Port(%q) should fail", bad)
		}
	}
}

// SetProxyEnforcement must refuse to turn the web-port gate on when the
// firewall has no proxy_config map (adopted from a pin set that predates the
// feature) or when no valid proxy address is available — gating web ports with
// no reachable proxy would brick all HTTP(S) egress. Disabling must always
// succeed so legacy firewalls stay manageable.
func TestSetProxyEnforcement_RequiresMapAndAddr(t *testing.T) {
	fw := New(Config{})

	if err := fw.SetProxyEnforcement("172.20.0.1:18080", true); err == nil {
		t.Fatal("expected error: no proxy_config map handle")
	}
	if err := fw.SetProxyEnforcement("", false); err != nil {
		t.Fatalf("disabling without a map must succeed, got: %v", err)
	}
}
