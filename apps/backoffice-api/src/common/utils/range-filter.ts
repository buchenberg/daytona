/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { SelectQueryBuilder } from 'typeorm'
import { RangeDto } from '../dto'

/**
 * Apply a range filter to a query builder.
 * Adds >= min and/or <= max conditions based on provided range.
 */
export function applyRangeFilter<T>(
  queryBuilder: SelectQueryBuilder<T>,
  field: string,
  range: RangeDto | undefined,
  paramPrefix: string,
): void {
  if (!range) return

  if (range.min !== undefined) {
    queryBuilder.andWhere(`${field} >= :${paramPrefix}Min`, {
      [`${paramPrefix}Min`]: range.min,
    })
  }

  if (range.max !== undefined) {
    queryBuilder.andWhere(`${field} <= :${paramPrefix}Max`, {
      [`${paramPrefix}Max`]: range.max,
    })
  }
}
