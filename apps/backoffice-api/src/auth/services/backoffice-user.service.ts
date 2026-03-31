/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable, UnauthorizedException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { BackofficeUser } from '../../backoffice-db/entities/backoffice-user.entity'

@Injectable()
export class BackofficeUserService {
  constructor(
    @InjectRepository(BackofficeUser, 'backoffice')
    private readonly backofficeUserRepository: Repository<BackofficeUser>,
  ) {}

  async findOne(id: string): Promise<BackofficeUser | null> {
    return await this.backofficeUserRepository.findOne({ where: { id } })
  }

  async findByEmail(email: string): Promise<BackofficeUser | null> {
    return await this.backofficeUserRepository.findOne({
      where: { email },
    })
  }

  async createFromOidc(data: {
    id: string
    name: string
    email: string
    emailVerified: boolean
  }): Promise<BackofficeUser> {
    // Check if user is whitelisted
    const isWhitelisted = await this.isWhitelisted(data.email)
    if (!isWhitelisted) {
      throw new UnauthorizedException(`User ${data.email} is not whitelisted for backoffice access`)
    }

    const user = this.backofficeUserRepository.create({
      id: data.id,
      email: data.email,
      name: data.name,
      role: 'admin',
      lastLoginAt: new Date(),
    })

    return this.backofficeUserRepository.save(user)
  }

  async update(id: string, data: Partial<BackofficeUser>): Promise<BackofficeUser> {
    await this.backofficeUserRepository.update(id, data)
    return this.findOne(id)
  }

  async updateLastLogin(id: string): Promise<void> {
    await this.backofficeUserRepository.update(id, { lastLoginAt: new Date() })
  }

  async isWhitelisted(email: string): Promise<boolean> {
    const user = await this.backofficeUserRepository.findOne({ where: { email } })
    return !!user
  }

  async createUser(email: string, name: string, createdBy: string): Promise<BackofficeUser> {
    const user = this.backofficeUserRepository.create({
      email,
      name,
      role: 'admin',
      createdBy,
    })
    return await this.backofficeUserRepository.save(user)
  }
}
