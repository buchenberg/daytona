/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Body, Controller, Delete, Get, HttpCode, NotFoundException, Param, Post, UseGuards } from '@nestjs/common'
import { AuthenticatedRateLimitGuard } from '../common/guards/authenticated-rate-limit.guard'
import { AuthStrategy } from '../auth/decorators/auth-strategy.decorator'
import { AuthStrategyType } from '../auth/enums/auth-strategy-type.enum'
import { EmailDomainWhitelistService } from './email-domain-whitelist.service'
import { EmailDomainWhitelistDto } from './dto/email-domain-whitelist.dto'
import { AddDomainWhitelistDto } from './dto/add-domain-whitelist.dto'
import { ApiExcludeController } from '@nestjs/swagger'
import { UserManagementAuthContextGuard } from './guards/user-management-auth-context.guard'

@ApiExcludeController()
@Controller('email-domain-whitelist')
@AuthStrategy(AuthStrategyType.API_KEY)
@UseGuards(AuthenticatedRateLimitGuard)
@UseGuards(UserManagementAuthContextGuard)
export class EmailDomainWhitelistController {
  constructor(private readonly emailDomainWhitelistService: EmailDomainWhitelistService) {}

  @Get()
  async listWhitelistedDomains(): Promise<EmailDomainWhitelistDto[]> {
    const entries = await this.emailDomainWhitelistService.findAll()
    return entries.map(EmailDomainWhitelistDto.fromEntity)
  }

  @Get(':domain')
  async getDomainWhitelist(@Param('domain') domain: string): Promise<EmailDomainWhitelistDto> {
    const entry = await this.emailDomainWhitelistService.findByDomain(domain)
    if (!entry) {
      throw new NotFoundException()
    }
    return EmailDomainWhitelistDto.fromEntity(entry)
  }

  @Post()
  @HttpCode(201)
  async addDomainToWhitelist(@Body() dto: AddDomainWhitelistDto): Promise<EmailDomainWhitelistDto> {
    const entry = await this.emailDomainWhitelistService.create(dto.domain)
    return EmailDomainWhitelistDto.fromEntity(entry)
  }

  @Delete(':domain')
  @HttpCode(204)
  async removeDomainFromWhitelist(@Param('domain') domain: string): Promise<void> {
    return this.emailDomainWhitelistService.removeByDomain(domain)
  }
}
