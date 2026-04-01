/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Controller, Get, Put, Body, Req, UseGuards } from '@nestjs/common'
import { ApiTags, ApiOperation, ApiSecurity } from '@nestjs/swagger'
import { FlexibleAuthGuard } from '../common/guards/flexible-auth.guard'
import { AuthenticatedRequest } from '../common/interfaces/authenticated-request.interface'
import { SettingsService } from './settings.service'
import { UpdateSettingsDto } from './dto/update-settings.dto'

@ApiTags('settings')
@ApiSecurity('bearerAuth')
@UseGuards(FlexibleAuthGuard)
@Controller('settings')
export class SettingsController {
  constructor(private readonly settingsService: SettingsService) {}

  @Get()
  @ApiOperation({ summary: 'Get current user Mali settings' })
  async get(@Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.settingsService.get(userId)
  }

  @Put()
  @ApiOperation({ summary: 'Update Mali settings' })
  async update(@Body() body: UpdateSettingsDto, @Req() req: AuthenticatedRequest) {
    const userId = req.user?.id || 'anonymous'
    return this.settingsService.update(userId, body)
  }
}
