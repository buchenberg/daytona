/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Transform } from 'class-transformer'

/**
 * Decorator that normalizes a query parameter value into a flat string array.
 *
 * Handles three input shapes that can arrive from Express's qs parser:
 *  - single primitive: `?field=a`              -> `['a']`
 *  - repeated params:  `?field=a&field=b`      -> `['a', 'b']`
 *  - CSV value:        `?field=a,b,c`          -> `['a', 'b', 'c']`
 *  - mixed:            `?field=a,b&field=c`    -> `['a', 'b', 'c']`
 *
 * Empty strings produced by trailing commas are dropped. `undefined`/`null` pass through.
 */
export function CsvToArray() {
  return Transform(({ value }) => {
    if (value === undefined || value === null) {
      return value
    }

    const split = (raw: unknown): string[] => {
      if (typeof raw !== 'string') {
        return [String(raw)]
      }
      return raw
        .split(',')
        .map((entry) => entry.trim())
        .filter((entry) => entry.length > 0)
    }

    if (Array.isArray(value)) {
      return value.flatMap((entry) => split(entry))
    }
    return split(value)
  })
}
