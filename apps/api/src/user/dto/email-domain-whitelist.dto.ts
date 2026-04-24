/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { EmailDomainWhitelist } from '../email-domain-whitelist.entity'

export class EmailDomainWhitelistDto {
  domain: string
  whitelistedAt: string

  static fromEntity(entity: EmailDomainWhitelist): EmailDomainWhitelistDto {
    return {
      domain: entity.domain,
      whitelistedAt: entity.createdAt.toISOString(),
    }
  }
}
