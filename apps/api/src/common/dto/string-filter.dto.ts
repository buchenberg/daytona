/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { ArrayMaxSize, IsArray, IsOptional, IsString } from 'class-validator'
import { CsvToArray } from '../decorators/csv-to-array.decorator'
import { MAX_FILTER_VALUES } from '../constants/filter-limits.constants'

export interface StringFilter {
  eq?: string
  not?: string
  in?: string[]
  notIn?: string[]
}

/**
 * Composable filter for `keyword`-style fields.
 *
 * Supports four operators that map cleanly to OpenSearch term-level queries
 * and to TypeORM Equal/Not/In primitives:
 *   - `eq`    -> exact match
 *   - `not`   -> exact non-match
 *   - `in`    -> match any of N values (OR within the list)
 *   - `notIn` -> match none of N values
 *
 * When multiple operators are specified on the same filter they compose with AND.
 */
@ApiSchema({ name: 'StringFilter' })
export class StringFilterDto implements StringFilter {
  @ApiPropertyOptional({
    type: String,
    description: 'Match values equal to this value.',
  })
  @IsOptional()
  @IsString()
  eq?: string

  @ApiPropertyOptional({
    type: String,
    description: 'Match values not equal to this value.',
  })
  @IsOptional()
  @IsString()
  not?: string;

  @ApiPropertyOptional({
    type: [String],
    description: `Match values present in this list. Accepts comma-separated values or repeated query parameters. Maximum ${MAX_FILTER_VALUES} entries.`,
  })
  @IsOptional()
  @CsvToArray()
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsString({ each: true })
  in?: string[]

  @ApiPropertyOptional({
    type: [String],
    description: `Match values not present in this list. Accepts comma-separated values or repeated query parameters. Maximum ${MAX_FILTER_VALUES} entries.`,
  })
  @IsOptional()
  @CsvToArray()
  @IsArray()
  @ArrayMaxSize(MAX_FILTER_VALUES)
  @IsString({ each: true })
  notIn?: string[]
}
