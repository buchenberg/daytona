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
