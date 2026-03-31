import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { RegionQuota } from '@api/organization/entities/region-quota.entity'
import { PaginationResponseDto } from '../../common/dto/pagination.dto'

export class RegionQuotaResponseDto implements Partial<RegionQuota> {
  @ApiProperty() organizationId: string
  @ApiProperty() regionId: string
  @ApiProperty() totalCpuQuota: number
  @ApiProperty() totalMemoryQuota: number
  @ApiProperty() totalDiskQuota: number
  @ApiPropertyOptional() sandboxQuota?: number
  @ApiProperty() createdAt: Date
  @ApiProperty() updatedAt: Date
  @ApiPropertyOptional() organizationName?: string
}

export class RegionQuotaSearchDataDto {
  @ApiProperty({ type: [RegionQuotaResponseDto], description: 'List of region quotas' })
  regionQuotas: RegionQuotaResponseDto[]
}

export class RegionQuotaSearchResponseDto {
  @ApiProperty({ description: 'Operation success status' })
  success: boolean

  @ApiProperty({ type: RegionQuotaSearchDataDto, description: 'Search results data' })
  data: RegionQuotaSearchDataDto

  @ApiProperty({ type: PaginationResponseDto, description: 'Pagination information' })
  pagination: PaginationResponseDto
}
