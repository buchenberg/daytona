import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsDate, IsOptional } from 'class-validator'

export interface DateFilter {
  gte?: Date
  lte?: Date
  gt?: Date
  lt?: Date
}

/**
 * Composable filter for `date` fields.
 *
 * Only range operators are exposed - exact equality / membership on timestamps
 * is rarely useful and creates surprising semantics across timezones / precision.
 * Multiple operators compose with AND (e.g. `gte` + `lte` -> closed interval).
 */
@ApiSchema({ name: 'DateFilter' })
export class DateFilterDto implements DateFilter {
  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Match values greater than or equal to this timestamp (ISO 8601).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  gte?: Date

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Match values less than or equal to this timestamp (ISO 8601).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lte?: Date

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Match values strictly greater than this timestamp (ISO 8601).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  gt?: Date

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Match values strictly less than this timestamp (ISO 8601).',
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  lt?: Date
}
