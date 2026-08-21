import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'
import { Type } from 'class-transformer'
import { IsBoolean, IsOptional, IsString, ValidateNested } from 'class-validator'
import { PaginationDto, PaginationResponseDto, SortDto } from '../../common/dto'
import { FleetRunnerDto } from './fleet-runner.dto'

export class FleetRunnerFiltersDto {
  @ApiPropertyOptional({ description: 'Matches name, ip or domain' })
  @IsOptional()
  @IsString()
  search?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  env?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  provider?: string

  @ApiPropertyOptional({ description: 'Inventory region (region or location)' })
  @IsOptional()
  @IsString()
  invRegion?: string

  @ApiPropertyOptional({ description: 'Production region label' })
  @IsOptional()
  @IsString()
  prodRegion?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  tenant?: string

  @ApiPropertyOptional({ description: "Production state, or 'missing' for runners without a prod row" })
  @IsOptional()
  @IsString()
  prodState?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabledOnly?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  gpuOnly?: boolean

  @ApiPropertyOptional({ description: 'Include runners removed from the inventory' })
  @IsOptional()
  @IsBoolean()
  includeRemoved?: boolean
}

export class SearchFleetRunnersDto {
  @ApiPropertyOptional({ type: FleetRunnerFiltersDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => FleetRunnerFiltersDto)
  filters?: FleetRunnerFiltersDto

  @ApiPropertyOptional({ type: PaginationDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PaginationDto)
  pagination?: PaginationDto

  @ApiPropertyOptional({ type: SortDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SortDto)
  sort?: SortDto
}

export class FleetRunnerSearchDataDto {
  @ApiProperty({ type: [FleetRunnerDto] })
  runners: FleetRunnerDto[]
}

export class FleetRunnerSearchResponseDto {
  @ApiProperty()
  success: boolean

  @ApiProperty({ type: FleetRunnerSearchDataDto })
  data: FleetRunnerSearchDataDto

  @ApiProperty({ type: PaginationResponseDto })
  pagination: PaginationResponseDto
}

/** Distinct values for the fleet filter dropdowns. */
export class FleetFilterOptionsDto {
  @ApiProperty({ type: [String] })
  envs: string[]

  @ApiProperty({ type: [String] })
  providers: string[]

  @ApiProperty({ type: [String] })
  invRegions: string[]

  @ApiProperty({ type: [String] })
  prodRegions: string[]

  @ApiProperty({ type: [String] })
  tenants: string[]
}
