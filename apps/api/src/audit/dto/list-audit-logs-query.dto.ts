import { ApiPropertyOptional, ApiSchema } from '@nestjs/swagger'
import { PageNumber } from '../../common/decorators/page-number.decorator'
import { PageLimit } from '../../common/decorators/page-limit.decorator'
import { IsDate, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'
import { StringFilterDto } from '../../common/dto/string-filter.dto'
import { IntFilterDto } from '../../common/dto/int-filter.dto'
import { DateFilterDto } from '../../common/dto/date-filter.dto'

export const MAX_AUDIT_FILTER_RULES = 10

@ApiSchema({ name: 'ListAuditLogsQuery' })
export class ListAuditLogsQueryDto {
  @PageNumber(1)
  page = 1

  @PageLimit(100)
  limit = 100

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Deprecated alias for `createdAt[gte]`. From date (ISO 8601 format).',
    deprecated: true,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  from?: Date

  @ApiPropertyOptional({
    type: String,
    format: 'date-time',
    description: 'Deprecated alias for `createdAt[lte]`. To date (ISO 8601 format).',
    deprecated: true,
  })
  @IsOptional()
  @Type(() => Date)
  @IsDate()
  to?: Date

  @ApiPropertyOptional({
    type: String,
    description: 'Token for cursor-based pagination. When provided, takes precedence over page parameter.',
  })
  @IsOptional()
  @IsString()
  nextToken?: string

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by audit log ID.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  id?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by actor user ID.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  actorId?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by actor email.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  actorEmail?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by actor API key prefix.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  actorApiKeyPrefix?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by actor API key suffix.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  actorApiKeySuffix?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by action.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  action?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by target type.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  targetType?: StringFilterDto

  @ApiPropertyOptional({ type: StringFilterDto, description: 'Filter by target ID.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => StringFilterDto)
  targetId?: StringFilterDto

  @ApiPropertyOptional({ type: IntFilterDto, description: 'Filter by HTTP status code.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => IntFilterDto)
  statusCode?: IntFilterDto

  @ApiPropertyOptional({ type: DateFilterDto, description: 'Filter by creation timestamp.' })
  @IsOptional()
  @ValidateNested()
  @Type(() => DateFilterDto)
  createdAt?: DateFilterDto
}
