/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { Transform, Type } from 'class-transformer'
import { ArrayMaxSize, IsArray, IsInt, IsOptional } from 'class-validator'
import { MAX_FILTER_VALUES } from '../constants/filter-limits.constants'

function csvToIntArray(value: unknown): number[] | undefined {
  if (value === undefined || value === null) {
    return value as undefined
  }

  const toNumbers = (raw: unknown): number[] => {
    if (typeof raw === 'number') {
      return [raw]
    }
    if (typeof raw !== 'string') {
      return [Number(raw)]
    }
    return raw
      .split(',')
      .map((entry) => entry.trim())
      .filter((entry) => entry.length > 0)
      .map((entry) => Number(entry))
  }

  if (Array.isArray(value)) {
    return value.flatMap((entry) => toNumbers(entry))
  }
  return toNumbers(value)
}

export interface IntFilter {
  eq?: number
  not?: number
  in?: number[]
  notIn?: number[]
  gte?: number
  lte?: number
  gt?: number
  lt?: number
}

/**
 * Composable filter for integer fields.
 *
 * Adds range operators (`gte`, `lte`, `gt`, `lt`) on top of the standard
 * equality/membership operators. All specified operators compose with AND.
 */
@ApiSchema({ name: 'IntFilter' })
export class IntFilterDto implements IntFilter {
  @ApiPropertyOptional({
    type: Number,
    description: 'Match values equal to this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  eq?: number

  @ApiPropertyOptional({
    type: Number,
    description: 'Match values not equal to this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  not?: number;

  @ApiPropertyOptional({
    type: [Number],
    description: `Match values present in this list. Accepts comma-separated values or repeated query parameters. Maximum ${MAX_FILTER_VALUES} entries.`,
  })
  @IsOptional()
  @Transform(({ value }) => csvToIntArray(value))
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsInt({ each: true })
  in?: number[]

  @ApiPropertyOptional({
    type: [Number],
    description: `Match values not present in this list. Accepts comma-separated values or repeated query parameters. Maximum ${MAX_FILTER_VALUES} entries.`,
  })
  @IsOptional()
  @Transform(({ value }) => csvToIntArray(value))
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsInt({ each: true })
  notIn?: number[]

  @ApiPropertyOptional({
    type: Number,
    description: 'Match values greater than or equal to this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gte?: number

  @ApiPropertyOptional({
    type: Number,
    description: 'Match values less than or equal to this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lte?: number

  @ApiPropertyOptional({
    type: Number,
    description: 'Match values strictly greater than this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  gt?: number

  @ApiPropertyOptional({
    type: Number,
    description: 'Match values strictly less than this value.',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  lt?: number
}
