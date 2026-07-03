/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

export const SANDBOX_WARM_POOL_UNASSIGNED_ORGANIZATION = '00000000-0000-0000-0000-000000000000'

// Redis key prefix under which the otel collector caches resolved organization OTEL configs
// by sandbox auth token. Must match the prefix passed to NewRedisCache in
// apps/otel-collector/exporter/factory.go.
export const OTEL_CONFIG_CACHE_KEY_PREFIX = 'org-otel-config:'
