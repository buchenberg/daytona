// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: Apache-2.0

package telemetry

import (
	"context"
	"sync"

	"go.opentelemetry.io/otel/attribute"
	sdk_metric "go.opentelemetry.io/otel/sdk/metric"
	"go.opentelemetry.io/otel/sdk/metric/metricdata"
)

// asyncExporter makes metric Export non-blocking so a stalled collector can't freeze the cache:
// the PeriodicReader runs cache-refreshing Collect and Export on the same goroutine.
type asyncExporter struct {
	wrapped  sdk_metric.Exporter
	ch       chan *metricdata.ResourceMetrics
	done     chan struct{}
	wg       sync.WaitGroup
	stopOnce sync.Once
}

var _ sdk_metric.Exporter = (*asyncExporter)(nil)

func newAsyncExporter(exporter sdk_metric.Exporter) *asyncExporter {
	e := &asyncExporter{
		wrapped: exporter,
		// cap 1 + drop-on-full (Export): keep only the latest batch, never block or queue.
		ch:   make(chan *metricdata.ResourceMetrics, 1),
		done: make(chan struct{}),
	}
	e.wg.Add(1)
	go e.run()
	return e
}

func (e *asyncExporter) run() {
	defer e.wg.Done()
	for {
		select {
		case <-e.done:
			return
		case rm := <-e.ch:
			// Independent context: the reader cancels Export's ctx the instant Export returns.
			_ = e.wrapped.Export(context.Background(), rm)
		}
	}
}

func (e *asyncExporter) Temporality(k sdk_metric.InstrumentKind) metricdata.Temporality {
	return e.wrapped.Temporality(k)
}

func (e *asyncExporter) Aggregation(k sdk_metric.InstrumentKind) sdk_metric.Aggregation {
	return e.wrapped.Aggregation(k)
}

// Export deep-copies rm because the reader reuses its pooled ResourceMetrics once Export returns.
func (e *asyncExporter) Export(_ context.Context, rm *metricdata.ResourceMetrics) error {
	cp := deepCopyResourceMetrics(rm)
	select {
	case e.ch <- cp:
	default:
	}
	return nil
}

func (e *asyncExporter) ForceFlush(ctx context.Context) error {
	return e.wrapped.ForceFlush(ctx)
}

// Shutdown closes done (never ch, so a racing Export can't send on a closed channel), waits for
// any in-flight export bounded by ctx, then shuts the wrapped exporter down.
func (e *asyncExporter) Shutdown(ctx context.Context) error {
	e.stopOnce.Do(func() { close(e.done) })

	waited := make(chan struct{})
	go func() {
		e.wg.Wait()
		close(waited)
	}()
	select {
	case <-waited:
	case <-ctx.Done():
	}

	return e.wrapped.Shutdown(ctx)
}

// deepCopyResourceMetrics returns a copy sharing no mutable slice with rm, since the reader
// overwrites the pooled original; immutable Resource/Scope/attribute.Set are shared by value.
func deepCopyResourceMetrics(rm *metricdata.ResourceMetrics) *metricdata.ResourceMetrics {
	if rm == nil {
		return nil
	}
	out := &metricdata.ResourceMetrics{
		Resource:     rm.Resource,
		ScopeMetrics: make([]metricdata.ScopeMetrics, len(rm.ScopeMetrics)),
	}
	for i, sm := range rm.ScopeMetrics {
		metrics := make([]metricdata.Metrics, len(sm.Metrics))
		for j, m := range sm.Metrics {
			metrics[j] = metricdata.Metrics{
				Name:        m.Name,
				Description: m.Description,
				Unit:        m.Unit,
				Data:        copyAggregation(m.Data),
			}
		}
		out.ScopeMetrics[i] = metricdata.ScopeMetrics{Scope: sm.Scope, Metrics: metrics}
	}
	return out
}

func copyAggregation(a metricdata.Aggregation) metricdata.Aggregation {
	switch v := a.(type) {
	case metricdata.Gauge[int64]:
		return metricdata.Gauge[int64]{DataPoints: copyDataPoints(v.DataPoints)}
	case metricdata.Gauge[float64]:
		return metricdata.Gauge[float64]{DataPoints: copyDataPoints(v.DataPoints)}
	case metricdata.Sum[int64]:
		return metricdata.Sum[int64]{DataPoints: copyDataPoints(v.DataPoints), Temporality: v.Temporality, IsMonotonic: v.IsMonotonic}
	case metricdata.Sum[float64]:
		return metricdata.Sum[float64]{DataPoints: copyDataPoints(v.DataPoints), Temporality: v.Temporality, IsMonotonic: v.IsMonotonic}
	case metricdata.Histogram[int64]:
		return metricdata.Histogram[int64]{DataPoints: copyHistogramDataPoints(v.DataPoints), Temporality: v.Temporality}
	case metricdata.Histogram[float64]:
		return metricdata.Histogram[float64]{DataPoints: copyHistogramDataPoints(v.DataPoints), Temporality: v.Temporality}
	case metricdata.ExponentialHistogram[int64]:
		return metricdata.ExponentialHistogram[int64]{DataPoints: copyExponentialHistogramDataPoints(v.DataPoints), Temporality: v.Temporality}
	case metricdata.ExponentialHistogram[float64]:
		return metricdata.ExponentialHistogram[float64]{DataPoints: copyExponentialHistogramDataPoints(v.DataPoints), Temporality: v.Temporality}
	case metricdata.Summary:
		return metricdata.Summary{DataPoints: copySummaryDataPoints(v.DataPoints)}
	default:
		// Unreachable for SDK-produced types; pass through rather than drop.
		return a
	}
}

func copyDataPoints[N int64 | float64](src []metricdata.DataPoint[N]) []metricdata.DataPoint[N] {
	if src == nil {
		return nil
	}
	dst := make([]metricdata.DataPoint[N], len(src))
	for i, dp := range src {
		dst[i] = metricdata.DataPoint[N]{
			Attributes: dp.Attributes,
			StartTime:  dp.StartTime,
			Time:       dp.Time,
			Value:      dp.Value,
			Exemplars:  copyExemplars(dp.Exemplars),
		}
	}
	return dst
}

func copyHistogramDataPoints[N int64 | float64](src []metricdata.HistogramDataPoint[N]) []metricdata.HistogramDataPoint[N] {
	if src == nil {
		return nil
	}
	dst := make([]metricdata.HistogramDataPoint[N], len(src))
	for i, dp := range src {
		dst[i] = metricdata.HistogramDataPoint[N]{
			Attributes:   dp.Attributes,
			StartTime:    dp.StartTime,
			Time:         dp.Time,
			Count:        dp.Count,
			Bounds:       append([]float64(nil), dp.Bounds...),
			BucketCounts: append([]uint64(nil), dp.BucketCounts...),
			Min:          dp.Min,
			Max:          dp.Max,
			Sum:          dp.Sum,
			Exemplars:    copyExemplars(dp.Exemplars),
		}
	}
	return dst
}

func copyExponentialHistogramDataPoints[N int64 | float64](src []metricdata.ExponentialHistogramDataPoint[N]) []metricdata.ExponentialHistogramDataPoint[N] {
	if src == nil {
		return nil
	}
	dst := make([]metricdata.ExponentialHistogramDataPoint[N], len(src))
	for i, dp := range src {
		dst[i] = metricdata.ExponentialHistogramDataPoint[N]{
			Attributes:     dp.Attributes,
			StartTime:      dp.StartTime,
			Time:           dp.Time,
			Count:          dp.Count,
			Min:            dp.Min,
			Max:            dp.Max,
			Sum:            dp.Sum,
			Scale:          dp.Scale,
			ZeroCount:      dp.ZeroCount,
			PositiveBucket: copyExponentialBucket(dp.PositiveBucket),
			NegativeBucket: copyExponentialBucket(dp.NegativeBucket),
			ZeroThreshold:  dp.ZeroThreshold,
			Exemplars:      copyExemplars(dp.Exemplars),
		}
	}
	return dst
}

func copyExponentialBucket(b metricdata.ExponentialBucket) metricdata.ExponentialBucket {
	return metricdata.ExponentialBucket{Offset: b.Offset, Counts: append([]uint64(nil), b.Counts...)}
}

func copySummaryDataPoints(src []metricdata.SummaryDataPoint) []metricdata.SummaryDataPoint {
	if src == nil {
		return nil
	}
	dst := make([]metricdata.SummaryDataPoint, len(src))
	for i, dp := range src {
		dst[i] = metricdata.SummaryDataPoint{
			Attributes:     dp.Attributes,
			StartTime:      dp.StartTime,
			Time:           dp.Time,
			Count:          dp.Count,
			Sum:            dp.Sum,
			QuantileValues: append([]metricdata.QuantileValue(nil), dp.QuantileValues...),
		}
	}
	return dst
}

func copyExemplars[N int64 | float64](src []metricdata.Exemplar[N]) []metricdata.Exemplar[N] {
	if src == nil {
		return nil
	}
	dst := make([]metricdata.Exemplar[N], len(src))
	for i, ex := range src {
		dst[i] = metricdata.Exemplar[N]{
			FilteredAttributes: append([]attribute.KeyValue(nil), ex.FilteredAttributes...),
			Time:               ex.Time,
			Value:              ex.Value,
			SpanID:             append([]byte(nil), ex.SpanID...),
			TraceID:            append([]byte(nil), ex.TraceID...),
		}
	}
	return dst
}
