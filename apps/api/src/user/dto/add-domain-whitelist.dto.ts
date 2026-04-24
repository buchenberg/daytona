/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { IsFQDN, IsNotEmpty, IsString } from 'class-validator'

export class AddDomainWhitelistDto {
  @IsString()
  @IsNotEmpty()
  @IsFQDN()
  domain: string
}
