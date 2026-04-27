/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { UserController } from './user.controller'
import { EmailDomainWhitelistController } from './email-domain-whitelist.controller'
import { UserService } from './user.service'
import { TypeOrmModule } from '@nestjs/typeorm'
import { User } from './user.entity'
import { EmailDomainWhitelist } from './email-domain-whitelist.entity'
import { EmailDomainWhitelistService } from './email-domain-whitelist.service'

@Module({
  imports: [TypeOrmModule.forFeature([User, EmailDomainWhitelist])],
  controllers: [UserController, EmailDomainWhitelistController],
  providers: [UserService, EmailDomainWhitelistService],
  exports: [UserService, EmailDomainWhitelistService],
})
export class UserModule {}
