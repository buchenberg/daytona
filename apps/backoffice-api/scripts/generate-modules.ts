import * as fs from 'fs'
import * as path from 'path'

const srcDir = path.join(__dirname, '../src')

interface ModuleConfig {
  name: string
  entityName: string
  entityPath: string
  pluralName: string
  hasCompositeKey?: boolean
}

const modules: ModuleConfig[] = [
  {
    name: 'sandboxes',
    entityName: 'Sandbox',
    entityPath: '@api/sandbox/entities/sandbox.entity',
    pluralName: 'sandboxes',
  },
  {
    name: 'runners',
    entityName: 'Runner',
    entityPath: '@api/sandbox/entities/runner.entity',
    pluralName: 'runners',
  },
  {
    name: 'snapshots',
    entityName: 'Snapshot',
    entityPath: '@api/sandbox/entities/snapshot.entity',
    pluralName: 'snapshots',
  },
  {
    name: 'organization-users',
    entityName: 'OrganizationUser',
    entityPath: '@api/organization/entities/organization-user.entity',
    pluralName: 'organizationUsers',
    hasCompositeKey: true,
  },
  {
    name: 'region-quotas',
    entityName: 'RegionQuota',
    entityPath: '@api/organization/entities/region-quota.entity',
    pluralName: 'regionQuotas',
    hasCompositeKey: true,
  },
]

function toPascalCase(str: string): string {
  return str
    .split('-')
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join('')
}

function generateController(config: ModuleConfig): string {
  const className = toPascalCase(config.name)

  return `/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Param, Body, Patch, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity, ApiParam } from '@nestjs/swagger'
import { BasicAuthGuard, AuthenticatedRequest } from '../../common/guards/basic-auth.guard'
import { ${className}Service } from '../services'
import { Update${config.entityName}Dto } from '../dto'

@ApiTags('${config.name}')
@ApiSecurity('basicAuth')
@UseGuards(BasicAuthGuard)
@Controller('${config.name}')
export class ${className}Controller {
  constructor(private readonly ${config.pluralName}Service: ${className}Service) {}

  @Patch(':id')
  @ApiOperation({ summary: 'Update a ${config.entityName.toLowerCase()}' })
  @ApiParam({ name: 'id', description: '${config.entityName} ID' })
  @ApiResponse({ status: 200, description: '${config.entityName} updated successfully' })
  @ApiResponse({ status: 400, description: 'Bad request - validation failed' })
  @ApiResponse({ status: 404, description: '${config.entityName} not found' })
  async update(@Param('id') id: string, @Body() updateDto: Update${config.entityName}Dto, @Req() req: AuthenticatedRequest) {
    try {
      const userId = req.user?.id || 'unknown'
      const result = await this.${config.pluralName}Service.update(id, updateDto, userId)

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: {
          code: 'UPDATE_FAILED',
          message,
        },
      }
    }
  }
}
`
}

function generateBulkController(config: ModuleConfig): string {
  const className = toPascalCase(config.name)

  return `/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards, Req } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { BasicAuthGuard, AuthenticatedRequest } from '../../common/guards/basic-auth.guard'
import { ${className}BulkService } from '../services'
import { BulkUpdate${config.entityName}Dto } from '../dto'

@ApiTags('${config.name}')
@ApiSecurity('basicAuth')
@UseGuards(BasicAuthGuard)
@Controller('${config.name}')
export class ${className}BulkController {
  constructor(private readonly ${config.pluralName}BulkService: ${className}BulkService) {}

  @Post('bulk-update')
  @ApiOperation({ summary: 'Bulk update ${config.name}' })
  @ApiResponse({ status: 200, description: 'Bulk update completed' })
  async bulkUpdate(@Body() bulkUpdateDto: BulkUpdate${config.entityName}Dto, @Req() req: AuthenticatedRequest) {
    try {
      const userId = req.user?.id || 'unknown'
      const result = await this.${config.pluralName}BulkService.bulkUpdate(bulkUpdateDto, userId)

      return {
        success: true,
        data: result,
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Unknown error'
      return {
        success: false,
        error: {
          code: 'BULK_UPDATE_FAILED',
          message,
        },
      }
    }
  }
}
`
}

function generateSearchController(config: ModuleConfig): string {
  const className = toPascalCase(config.name)

  return `/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Post, Body, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiResponse, ApiSecurity } from '@nestjs/swagger'
import { BasicAuthGuard } from '../../common/guards/basic-auth.guard'
import { ${className}SearchService } from '../services'
import { Search${config.entityName}Dto } from '../dto'

@ApiTags('${config.name}')
@ApiSecurity('basicAuth')
@UseGuards(BasicAuthGuard)
@Controller('${config.name}')
export class ${className}SearchController {
  constructor(private readonly ${config.pluralName}SearchService: ${className}SearchService) {}

  @Post('search')
  @ApiOperation({ summary: 'Search ${config.name}' })
  @ApiResponse({ status: 200, description: 'Search results' })
  async search(@Body() searchDto: Search${config.entityName}Dto) {
    return await this.${config.pluralName}SearchService.search(searchDto)
  }
}
`
}

function generateModule(config: ModuleConfig): string {
  const className = toPascalCase(config.name)

  return `/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { ${config.entityName} } from '${config.entityPath}'
import { ${className}Controller, ${className}BulkController, ${className}SearchController } from './controllers'
import { ${className}Service, ${className}BulkService, ${className}SearchService } from './services'

@Module({
  imports: [TypeOrmModule.forFeature([${config.entityName}])],
  controllers: [${className}Controller, ${className}BulkController, ${className}SearchController],
  providers: [${className}Service, ${className}BulkService, ${className}SearchService],
  exports: [${className}Service, ${className}BulkService, ${className}SearchService],
})
export class ${className}Module {}
`
}

// Generate all module files
modules.forEach((config) => {
  const moduleDir = path.join(srcDir, config.name)
  const controllersDir = path.join(moduleDir, 'controllers')

  // Generate controllers
  fs.writeFileSync(path.join(controllersDir, `${config.name}.controller.ts`), generateController(config))

  fs.writeFileSync(path.join(controllersDir, `${config.name}-bulk.controller.ts`), generateBulkController(config))

  fs.writeFileSync(path.join(controllersDir, `${config.name}-search.controller.ts`), generateSearchController(config))

  // Generate module file
  fs.writeFileSync(path.join(moduleDir, `${config.name}.module.ts`), generateModule(config))

  console.log(`✓ Generated module files for ${config.name}`)
})

console.log('\n✅ All module files generated successfully!')
