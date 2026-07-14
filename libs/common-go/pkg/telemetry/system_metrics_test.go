// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"math"
	"testing"
	"time"
)

func TestSystemMetricsStoreRecordUsage(t *testing.T) {
	const sec = int64(1_000_000_000)
	t0 := time.Unix(1_700_000_000, 0)
	limit := func(cpu float64) *ResourceLimits { return &ResourceLimits{CPULimit: cpu} }

	t.Run("cold start leaves cpuUsedPct at 0 and cpuValid false", func(t *testing.T) {
		s := NewSystemMetricsStore()
		_, cpuValid, _ := s.recordUsage(1000, 0, 0, t0, limit(1.0))
		if cpuValid {
			t.Error("cold-start cpuValid = true, want false")
		}
		if s.Snapshot().CPUUsedPct != 0 {
			t.Errorf("cold-start cpuUsedPct = %g, want 0", s.Snapshot().CPUUsedPct)
		}
	})

	t.Run("normal delta computes percentage", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(0, 0, 0, t0, limit(1.0))
		_, cpuValid, _ := s.recordUsage(uint64(sec/2), 0, 0, t0.Add(time.Second), limit(1.0))
		if !cpuValid {
			t.Error("cpuValid = false, want true")
		}
		if math.Abs(s.Snapshot().CPUUsedPct-50.0) > 0.001 {
			t.Errorf("cpuUsedPct = %g, want 50", s.Snapshot().CPUUsedPct)
		}
	})

	t.Run("counter reset zeros cpuUsedPct", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(0, 0, 0, t0, limit(1.0))
		s.recordUsage(uint64(sec), 0, 0, t0.Add(time.Second), limit(1.0))
		if s.Snapshot().CPUUsedPct == 0 {
			t.Fatal("precondition: expected non-zero before reset")
		}
		s.recordUsage(10, 0, 0, t0.Add(2*time.Second), limit(1.0)) // counter went backwards
		if s.Snapshot().CPUUsedPct != 0 {
			t.Errorf("after reset cpuUsedPct = %g, want 0", s.Snapshot().CPUUsedPct)
		}
	})

	t.Run("idle (unchanged counter) yields 0", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(5000, 0, 0, t0, limit(1.0))
		s.recordUsage(5000, 0, 0, t0.Add(time.Second), limit(1.0))
		if s.Snapshot().CPUUsedPct != 0 {
			t.Errorf("idle cpuUsedPct = %g, want 0", s.Snapshot().CPUUsedPct)
		}
	})

	t.Run("non-monotonic clock zeros cpuUsedPct", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(0, 0, 0, t0, limit(1.0))
		s.recordUsage(uint64(sec), 0, 0, t0.Add(time.Second), limit(1.0))
		s.recordUsage(uint64(2*sec), 0, 0, t0, limit(1.0)) // clock jumped backwards
		if s.Snapshot().CPUUsedPct != 0 {
			t.Errorf("backwards-clock cpuUsedPct = %g, want 0", s.Snapshot().CPUUsedPct)
		}
	})

	t.Run("zero cpu limit never computes", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(0, 0, 0, t0, limit(0))
		s.recordUsage(uint64(sec), 0, 0, t0.Add(time.Second), limit(0))
		if s.Snapshot().CPUUsedPct != 0 {
			t.Errorf("zero-limit cpuUsedPct = %g, want 0", s.Snapshot().CPUUsedPct)
		}
	})

	t.Run("changed limits refresh snapshot totals", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(0, 1024, 0, t0, &ResourceLimits{CPULimit: 1, MemoryLimit: 4096})
		s.recordUsage(uint64(sec), 1024, 0, t0.Add(time.Second), &ResourceLimits{CPULimit: 2, MemoryLimit: 8192})
		snap := s.Snapshot()
		if snap.CPUCount != 2 || snap.MemTotal != 8192 {
			t.Errorf("after resize CPUCount = %d, MemTotal = %d, want 2, 8192", snap.CPUCount, snap.MemTotal)
		}
	})

	t.Run("snapshot carries mem and disk fields", func(t *testing.T) {
		s := NewSystemMetricsStore()
		s.recordUsage(0, 4096, 512, t0, &ResourceLimits{CPULimit: 2, MemoryLimit: 8192})
		s.recordDisk(100, 400, 300)
		snap := s.Snapshot()
		if !snap.Sampled || snap.MemUsed != 4096 || snap.MemCache != 512 || snap.MemTotal != 8192 || snap.CPUCount != 2 {
			t.Errorf("usage fields = %+v", snap)
		}
		if snap.DiskUsed != 100 || snap.DiskTotal != 400 || snap.DiskFree != 300 {
			t.Errorf("disk fields = %+v", snap)
		}
	})
}
