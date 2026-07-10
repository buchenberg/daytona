/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { InitialTableState } from '@tanstack/react-table'

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100, 200] as const
export const DEFAULT_PAGE_SIZE = 25

export function buildTableInitialState(overrides?: InitialTableState): InitialTableState {
  const { pagination, ...rest } = overrides ?? {}
  return {
    pagination: {
      pageSize: DEFAULT_PAGE_SIZE,
      ...pagination,
    },
    ...rest,
  }
}
