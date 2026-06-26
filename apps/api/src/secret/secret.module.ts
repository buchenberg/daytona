/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Module } from '@nestjs/common'
import { TypeOrmModule } from '@nestjs/typeorm'
import { Secret } from './entities/secret.entity'
import { SecretService } from './services/secret.service'
import { SecretController } from './controllers/secret.controller'
import { EncryptionModule } from '../encryption/encryption.module'
import { OrganizationModule } from '../organization/organization.module'

@Module({
  imports: [OrganizationModule, TypeOrmModule.forFeature([Secret]), EncryptionModule],
  controllers: [SecretController],
  providers: [SecretService],
  exports: [SecretService],
})
export class SecretModule {}
