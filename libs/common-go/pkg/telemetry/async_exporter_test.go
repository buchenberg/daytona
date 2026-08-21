// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"sync"
	"testing"
	"time"

	sdk_metric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

type fakeExporter struct {
	mu       sync.Mutex
	received []*metricdata.ResourceMetrics
	block    chan struct{}
}

func (f *fakeExporter) Temporality(k sdk_metric.InstrumentKind) metricdata.Temporality {
	return sdk_metric.DefaultTemporalitySelector(k)
}

func (f *fakeExporter) Aggregation(k sdk_metric.InstrumentKind) sdk_metric.Aggregation {
	return sdk_metric.DefaultAggregationSelector(k)
}

func (f *fakeExporter) Export(_ context.Context, rm *metricdata.ResourceMetrics) error {
	if f.block != nil {
		<-f.block
	}
	f.mu.Lock()
	f.received = append(f.received, rm)
	f.mu.Unlock()
	return nil
}

func (f *fakeExporter) ForceFlush(context.Context) error { return nil }
func (f *fakeExporter) Shutdown(context.Context) error   { return nil }

func (f *fakeExporter) waitForOne(t *testing.T, d time.Duration) *metricdata.ResourceMetrics {
	t.Helper()
	deadline := time.Now().Add(d)
	for time.Now().Before(deadline) {
		f.mu.Lock()
		var first *metricdata.ResourceMetrics
		if len(f.received) > 0 {
			first = f.received[0]
		}
		f.mu.Unlock()
		if first != nil {
			return first
		}
		time.Sleep(5 * time.Millisecond)
	}
	t.Fatal("no batch delivered within deadline")
	return nil
}

func gaugeRM(v int64) *metricdata.ResourceMetrics {
	return &metricdata.ResourceMetrics{
		ScopeMetrics: []metricdata.ScopeMetrics{{
			Metrics: []metricdata.Metrics{{
				Name: "g",
				Data: metricdata.Gauge[int64]{DataPoints: []metricdata.DataPoint[int64]{{Value: v}}},
			}},
		}},
	}
}

func TestDeepCopyResourceMetricsIsIndependent(t *testing.T) {
	src := &metricdata.ResourceMetrics{
		ScopeMetrics: []metricdata.ScopeMetrics{{
			Metrics: []metricdata.Metrics{
				{Name: "g", Data: metricdata.Gauge[float64]{DataPoints: []metricdata.DataPoint[float64]{{Value: 1.5}}}},
				{Name: "h", Data: metricdata.Histogram[int64]{DataPoints: []metricdata.HistogramDataPoint[int64]{{
					Bounds:       []float64{1, 2},
					BucketCounts: []uint64{3, 4},
				}}}},
			},
		}},
	}

	cp := deepCopyResourceMetrics(src)

	g := src.ScopeMetrics[0].Metrics[0].Data.(metricdata.Gauge[float64])
	g.DataPoints[0].Value = 99
	h := src.ScopeMetrics[0].Metrics[1].Data.(metricdata.Histogram[int64])
	h.DataPoints[0].Bounds[0] = 99
	h.DataPoints[0].BucketCounts[0] = 99

	cg := cp.ScopeMetrics[0].Metrics[0].Data.(metricdata.Gauge[float64])
	if cg.DataPoints[0].Value != 1.5 {
		t.Fatalf("gauge DataPoints shared: got %v, want 1.5", cg.DataPoints[0].Value)
	}
	ch := cp.ScopeMetrics[0].Metrics[1].Data.(metricdata.Histogram[int64])
	if ch.DataPoints[0].Bounds[0] != 1 || ch.DataPoints[0].BucketCounts[0] != 3 {
		t.Fatalf("histogram slices shared: bounds=%v counts=%v", ch.DataPoints[0].Bounds, ch.DataPoints[0].BucketCounts)
	}
}

func TestAsyncExporterExportNeverBlocks(t *testing.T) {
	block := make(chan struct{})
	fake := &fakeExporter{block: block}
	e := newAsyncExporter(fake)
	t.Cleanup(func() {
		close(block)
		_ = e.Shutdown(context.Background())
	})

	rm := gaugeRM(1)
	start := time.Now()
	for range 1000 {
		if err := e.Export(context.Background(), rm); err != nil {
			t.Fatalf("Export returned error: %v", err)
		}
	}
	if elapsed := time.Since(start); elapsed > 2*time.Second {
		t.Fatalf("Export appears to block: 1000 calls took %v while the worker was stuck", elapsed)
	}
}

func TestAsyncExporterDeliversCopy(t *testing.T) {
	fake := &fakeExporter{}
	e := newAsyncExporter(fake)
	t.Cleanup(func() { _ = e.Shutdown(context.Background()) })

	rm := gaugeRM(7)
	if err := e.Export(context.Background(), rm); err != nil {
		t.Fatalf("Export returned error: %v", err)
	}

	got := fake.waitForOne(t, 2*time.Second)
	if got == rm {
		t.Fatal("worker received the original rm pointer, not a copy")
	}
	v := got.ScopeMetrics[0].Metrics[0].Data.(metricdata.Gauge[int64]).DataPoints[0].Value
	if v != 7 {
		t.Fatalf("delivered value = %d, want 7", v)
	}
}
