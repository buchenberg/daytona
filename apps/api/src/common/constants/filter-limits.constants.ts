/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

/**
 * Maximum number of values allowed inside a single `in` / `notIn` filter operator.
 *
 * Sized to protect against runaway query expansion while staying far below OpenSearch's
 * default `index.max_terms_count` (65,536) and `indices.query.bool.max_clause_count` (1,024).
 */
export const MAX_FILTER_VALUES = 100
