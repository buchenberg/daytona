package manager

import (
	"testing"
)

// ConfigureInterface must reject a TC-mode attach with no interface name (a
// kata sandbox whose host veth couldn't be resolved), rather than silently
// attaching nothing — except when the call is just clearing the allow list.
func TestConfigureInterface_RequiresInterface(t *testing.T) {
	m := quietManager()

	if err := m.ConfigureInterface("wl-1", "", true, []string{"example.com"}, false); err == nil {
		t.Fatal("expected error when interface is empty but domains are set")
	}

	// Empty domains is a clear/remove; it must not require an interface and must
	// not error for an unmanaged workload.
	if err := m.ConfigureInterface("wl-1", "", true, nil, false); err != nil {
		t.Fatalf("clearing with empty interface should be a no-op, got: %v", err)
	}
	if m.IsManaged("wl-1") {
		t.Fatal("workload should not be managed after a clear")
	}
}
