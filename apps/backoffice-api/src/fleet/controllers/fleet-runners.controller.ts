import { Body, Controller, Get, HttpCode, Param, Post, UseGuards } from '@nestjs/common'
import { ApiOperation, ApiResponse, ApiSecurity, ApiTags } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../../common/guards/flexible-auth.guard'
import { PermissionsGuard } from '../../common/guards/permissions.guard'
import { RequirePermission } from '../../common/decorators/require-permission.decorator'
import { FleetRunnersService } from '../services'
import {
  DiscrepancyDto,
  FleetFilterOptionsDto,
  FleetRunnerDetailDto,
  FleetRunnerSearchResponseDto,
  SearchFleetRunnersDto,
} from '../dto'

@ApiTags('fleet')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard, PermissionsGuard)
@Controller('fleet/runners')
export class FleetRunnersController {
  constructor(private readonly fleetRunnersService: FleetRunnersService) {}

  @Post('search')
  @HttpCode(200)
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Search fleet runners (inventory merged with live production state)' })
  @ApiResponse({ status: 200, description: 'Search results', type: FleetRunnerSearchResponseDto })
  async search(@Body() searchDto: SearchFleetRunnersDto): Promise<FleetRunnerSearchResponseDto> {
    return this.fleetRunnersService.search(searchDto)
  }

  @Get('filter-options')
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Distinct values for the fleet filter dropdowns' })
  @ApiResponse({ status: 200, description: 'Filter options', type: FleetFilterOptionsDto })
  async filterOptions(): Promise<FleetFilterOptionsDto> {
    return this.fleetRunnersService.filterOptions()
  }

  @Get('discrepancies')
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Where inventory and production disagree' })
  @ApiResponse({ status: 200, description: 'Discrepancies', type: [DiscrepancyDto] })
  async discrepancies(): Promise<DiscrepancyDto[]> {
    return this.fleetRunnersService.discrepancies()
  }

  // Must stay declared after the static GET routes above: Nest matches in
  // declaration order and hostnames may be any [\w.-]+ string.
  @Get(':name')
  @RequirePermission(['fleet', 'read'])
  @ApiOperation({ summary: 'Fleet runner detail with production state, requests and event timeline' })
  @ApiResponse({ status: 200, description: 'Runner detail', type: FleetRunnerDetailDto })
  @ApiResponse({ status: 404, description: 'Unknown runner' })
  async detail(@Param('name') name: string): Promise<FleetRunnerDetailDto> {
    return this.fleetRunnersService.detail(name)
  }
}
