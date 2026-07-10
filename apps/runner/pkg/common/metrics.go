// Copyright 2025 Daytona Platforms Inc.
// SPDX-License-Identifier: AGPL-3.0

package common

import (
	"github.com/prometheus/client_golang/prometheus"
	"github.com/prometheus/client_golang/prometheus/promauto"
)

type PrometheusOperationStatus string

const (
	PrometheusOperationStatusSuccess PrometheusOperationStatus = "success"
	PrometheusOperationStatusFailure PrometheusOperationStatus = "failure"
)

// Define your metrics
var (
	// Histogram to track duration of container operations
	ContainerOperationDuration = promauto.NewHistogramVec(
		prometheus.HistogramOpts{
			Name: "container_operation_duration_seconds",
			Help: "Time taken for container operations in seconds",
			// Buckets optimized for detecting anomalies in operation durations
			Buckets: []float64{0.1, 0.25, 0.5, 0.75, 1, 2, 3, 5, 7.5, 10, 15, 30, 60, 120, 300},
		},
		[]string{"operation"},
	)

	// Counter to track occurrence of container operations with status
	ContainerOperationCount = promauto.NewCounterVec(
		prometheus.CounterOpts{
			Name: "container_operation_total",
			Help: "Total number of container operations",
		},
		[]string{"operation", "status"},
	)

	// Counter for backups rejected because the committed layer still carries
	// host-shifted (sysbox uid-shift) ownership; alert on rate() > 0.
	BackupOwnershipRejectedCount = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "backup_ownership_rejected_total",
			Help: "Number of backups rejected due to host-shifted ownership in the committed layer",
		},
	)

	// Counter for backups pushed despite out-of-namespace ownership because
	// the corruption predates the commit and no retry could produce a clean
	// backup; sizes the damaged sandbox population.
	BackupOwnershipPreexistingAllowedCount = promauto.NewCounter(
		prometheus.CounterOpts{
			Name: "backup_ownership_preexisting_allowed_total",
			Help: "Number of backups pushed despite out-of-namespace ownership that predates the commit (inherited or revert-wrapped)",
		},
	)
)
