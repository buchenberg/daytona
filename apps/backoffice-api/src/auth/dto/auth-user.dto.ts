/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiProperty } from '@nestjs/swagger'
import { PermissionsDto } from './permissions.dto'

export class AuthUserDto {
  @ApiProperty()
  id: string

  @ApiProperty()
  email: string

  @ApiProperty({ required: false })
  name?: string

  @ApiProperty({ type: PermissionsDto })
  permissions: PermissionsDto
}

export class AuthMeResponseDto {
  @ApiProperty()
  success: boolean

  @ApiProperty({ type: AuthUserDto })
  data: AuthUserDto
}

export class AuthRefreshDataDto {
  @ApiProperty({ type: AuthUserDto })
  user: AuthUserDto
}

export class AuthRefreshResponseDto {
  @ApiProperty()
  success: boolean

  @ApiProperty({ type: AuthRefreshDataDto })
  data: AuthRefreshDataDto
}
