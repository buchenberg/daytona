/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { IsBoolean, IsEmail, IsOptional, IsString } from 'class-validator'
import { IsSafeDisplayString } from '../../common/validators'

export class ProvisionUserDto {
  @IsEmail()
  email: string

  @IsOptional()
  @IsString()
  @IsSafeDisplayString()
  name?: string

  @IsBoolean()
  emailVerified: boolean
}
