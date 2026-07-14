package netrules

import (
	"strings"
	"testing"
)

func TestFormatAntiSpoofChainName(t *testing.T) {
	const id = "abc123def456"
	got := formatAntiSpoofChainName(id)
	if want := AntiSpoofChainPrefix + id; got != want {
		t.Fatalf("formatAntiSpoofChainName = %q, want %q", got, want)
	}
	// Idempotent: re-formatting an already-prefixed name is a no-op.
	if again := formatAntiSpoofChainName(got); again != got {
		t.Fatalf("formatAntiSpoofChainName not idempotent: %q -> %q", got, again)
	}
	// The short ID must be recoverable (reconcile extracts it this way).
	if id2 := strings.TrimPrefix(got, AntiSpoofChainPrefix); id2 != id {
		t.Fatalf("TrimPrefix recovered %q, want %q", id2, id)
	}
}

// Anti-spoof chains share the mangle table with the egress limiter's
// DAYTONA-SB- chains; their prefixes must be mutually exclusive or they'd
// collide (same chain name) and reconcileChains' TrimPrefix(…,"DAYTONA-SB-")
// would mis-extract the container ID from an anti-spoof chain.
func TestAntiSpoofPrefixDistinctFromSB(t *testing.T) {
	as := formatAntiSpoofChainName("deadbeef0001")
	sb := formatChainName("deadbeef0001")

	if strings.HasPrefix(as, ChainPrefix) {
		t.Fatalf("anti-spoof chain %q must not start with SB prefix %q", as, ChainPrefix)
	}
	if strings.HasPrefix(sb, AntiSpoofChainPrefix) {
		t.Fatalf("SB chain %q must not start with anti-spoof prefix %q", sb, AntiSpoofChainPrefix)
	}
	if as == sb {
		t.Fatal("anti-spoof and SB chain names must never be equal")
	}
}
