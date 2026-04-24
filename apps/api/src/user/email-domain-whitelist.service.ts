/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, Injectable, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { EmailDomainWhitelist } from './email-domain-whitelist.entity'

@Injectable()
export class EmailDomainWhitelistService {
  constructor(
    @InjectRepository(EmailDomainWhitelist)
    private readonly repository: Repository<EmailDomainWhitelist>,
  ) {}

  async findAll(): Promise<EmailDomainWhitelist[]> {
    return this.repository.find()
  }

  async findByDomain(domain: string): Promise<EmailDomainWhitelist | null> {
    return this.repository.findOne({ where: { domain: domain.toLowerCase() } })
  }

  async create(domain: string): Promise<EmailDomainWhitelist> {
    try {
      return await this.repository.save({
        domain: domain.toLowerCase(),
      })
    } catch (error) {
      if (error.code === '23505') {
        throw new ConflictException('Domain already whitelisted')
      }
      throw error
    }
  }

  async removeByDomain(domain: string): Promise<void> {
    const result = await this.repository.delete({ domain: domain.toLowerCase() })
    if (result.affected === 0) {
      throw new NotFoundException()
    }
  }
}
