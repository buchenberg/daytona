package proxy

import (
	"net"
	"testing"
	"time"
)

func TestAcquireConn_PerIPCap(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), nil, "", quiet,
		WithMaxConnsPerIP(1), WithMaxConns(100))

	if !s.acquireConn("10.0.0.1") {
		t.Fatal("first connection from an IP should be admitted")
	}
	if s.acquireConn("10.0.0.1") {
		t.Fatal("second concurrent connection from the same IP must be rejected")
	}
	if !s.acquireConn("10.0.0.2") {
		t.Fatal("a different IP should still be admitted")
	}

	// Freeing the first IP's slot lets it connect again.
	s.releaseConn("10.0.0.1")
	if !s.acquireConn("10.0.0.1") {
		t.Fatal("slot should be available after release")
	}
}

func TestAcquireConn_GlobalCap(t *testing.T) {
	// Per-IP cap disabled so only the global cap is under test.
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), nil, "", quiet,
		WithMaxConns(2), WithMaxConnsPerIP(0))

	if !s.acquireConn("10.0.0.1") || !s.acquireConn("10.0.0.2") {
		t.Fatal("connections up to the global cap should be admitted")
	}
	if s.acquireConn("10.0.0.3") {
		t.Fatal("connection beyond the global cap must be rejected")
	}
	s.releaseConn("10.0.0.1")
	if !s.acquireConn("10.0.0.3") {
		t.Fatal("a global slot should be available after release")
	}
}

// A rejected per-IP acquire must not leak a global slot.
func TestAcquireConn_RejectReleasesGlobalSlot(t *testing.T) {
	s := NewServer("127.0.0.1:0", nil, NewInjector(nil), nil, "", quiet,
		WithMaxConns(5), WithMaxConnsPerIP(1))

	if !s.acquireConn("10.0.0.1") {
		t.Fatal("first acquire should succeed")
	}
	// This is rejected by the per-IP cap; it must return the global slot it took.
	if s.acquireConn("10.0.0.1") {
		t.Fatal("second same-IP acquire should be rejected")
	}
	// Four more distinct IPs must still fit under the global cap of 5.
	for _, ip := range []string{"10.0.0.2", "10.0.0.3", "10.0.0.4", "10.0.0.5"} {
		if !s.acquireConn(ip) {
			t.Fatalf("global slot wrongly consumed by a rejected acquire; %s denied", ip)
		}
	}
}

func TestIdleConn_ReadTimeout(t *testing.T) {
	c1, c2 := net.Pipe()
	defer c1.Close()
	defer c2.Close()

	ic := &idleConn{Conn: c1, idle: 30 * time.Millisecond}
	start := time.Now()
	_, err := ic.Read(make([]byte, 1))
	if err == nil {
		t.Fatal("expected an idle read timeout with no data available")
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("read blocked far longer than the idle timeout: %v", elapsed)
	}
}
