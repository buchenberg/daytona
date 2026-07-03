// Copyright Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package system

import (
	"net/http"
	"time"

	"github.com/daytonaio/common-go/pkg/telemetry"
	"github.com/gin-gonic/gin"
)

// MetricsHandler serves the latest sandbox resource sample cached by the shared telemetry
// store. Collection is driven by the OTEL metric export reader (see common-go telemetry),
// so no separate sampling loop lives here.
type MetricsHandler struct {
	store *telemetry.SystemMetricsStore
}

func NewMetricsHandler(store *telemetry.SystemMetricsStore) *MetricsHandler {
	return &MetricsHandler{store: store}
}

// GetSystemMetrics godoc
//
//	@Summary		Get sandbox resource metrics
//	@Description	Latest CPU/memory/disk usage snapshot for the sandbox. cpuUsedPct is the
//	@Description	average CPU usage as a percentage of the CPU limit over the last sample
//	@Description	window (0 until the first sample completes). Byte fields are in bytes.
//	@Tags			system
//	@Produce		json
//	@Success		200	{object}	SystemMetrics
//	@Router			/system/metrics [get]
//
//	@id				GetSystemMetrics
func (h *MetricsHandler) GetSystemMetrics(c *gin.Context) {
	snap := h.store.Snapshot()
	now := time.Now().UTC()
	c.JSON(http.StatusOK, SystemMetrics{
		Timestamp:     now.Format(time.RFC3339),
		TimestampUnix: now.Unix(),
		CpuCount:      snap.CPUCount,
		CpuUsedPct:    snap.CPUUsedPct,
		MemUsed:       snap.MemUsed,
		MemTotal:      snap.MemTotal,
		MemCache:      snap.MemCache,
		DiskUsed:      snap.DiskUsed,
		DiskTotal:     snap.DiskTotal,
		DiskFree:      snap.DiskFree,
	})
}
