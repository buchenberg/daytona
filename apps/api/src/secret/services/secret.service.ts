/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { In, Repository } from 'typeorm'
import { Secret } from '../entities/secret.entity'
import { CreateSecretDto } from '../dto/create-secret.dto'
import { UpdateSecretDto } from '../dto/update-secret.dto'
import { EncryptionService } from '../../encryption/encryption.service'
import { BadRequestError } from '../../exceptions/bad-request.exception'
import { Organization } from '../../organization/entities/organization.entity'

@Injectable()
export class SecretService {
  private readonly logger = new Logger(SecretService.name)

  constructor(
    @InjectRepository(Secret)
    private readonly secretRepository: Repository<Secret>,
    private readonly encryptionService: EncryptionService,
  ) {}

  async create(createDto: CreateSecretDto, organization: Organization): Promise<Secret> {
    const existing = await this.secretRepository.findOne({
      where: { organizationId: organization.id, name: createDto.name },
    })

    if (existing) {
      throw new ConflictException(`Secret with name '${createDto.name}' already exists`)
    }

    const secretCount = await this.secretRepository.count({
      where: { organizationId: organization.id },
    })

    if (secretCount >= organization.secretQuota) {
      throw new BadRequestError(`Secret quota exceeded. Maximum allowed: ${organization.secretQuota}`)
    }

    const encryptedValue = await this.encryptionService.encrypt(createDto.value)

    const secret = this.secretRepository.create({
      name: createDto.name,
      encryptedValue,
      description: createDto.description,
      hosts: createDto.hosts ?? [],
      organizationId: organization.id,
    })

    try {
      return await this.secretRepository.save(secret)
    } catch (error) {
      // The findOne check above is best-effort; a concurrent create can still
      // race past it and hit the (organizationId, name) unique index. Surface a
      // 409 rather than a 500.
      if (error.code === '23505') {
        throw new ConflictException(`Secret with name '${createDto.name}' already exists`)
      }
      throw error
    }
  }

  async findAll(organizationId: string): Promise<Secret[]> {
    return this.secretRepository.find({
      where: { organizationId },
      order: {
        createdAt: 'DESC',
      },
    })
  }

  async findOne(secretId: string, organizationId: string): Promise<Secret> {
    const secret = await this.secretRepository.findOne({
      where: { id: secretId, organizationId },
    })

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${secretId} not found`)
    }

    return secret
  }

  async update(secretId: string, updateDto: UpdateSecretDto, organizationId: string): Promise<Secret> {
    const secret = await this.secretRepository.findOne({
      where: { id: secretId, organizationId },
    })

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${secretId} not found`)
    }

    if (updateDto.value !== undefined) {
      secret.encryptedValue = await this.encryptionService.encrypt(updateDto.value)
    }

    if (updateDto.description !== undefined) {
      secret.description = updateDto.description || undefined
    }

    if (updateDto.hosts !== undefined) {
      secret.hosts = updateDto.hosts
    }

    return this.secretRepository.save(secret)
  }

  async findByNames(names: string[], organizationId: string): Promise<Secret[]> {
    if (names.length === 0) {
      return []
    }
    return this.secretRepository.find({
      where: { organizationId, name: In(names) },
    })
  }

  async resolveForSandbox(
    mounts: { secretId: string; envVar: string }[],
    organizationId: string,
  ): Promise<{ env: string; placeholder: string; value: string; hosts: string[] }[]> {
    if (mounts.length === 0) {
      return []
    }

    const secretIds = mounts.map((m) => m.secretId)
    const secrets = await this.secretRepository.find({
      where: { id: In(secretIds), organizationId },
    })

    const secretMap = new Map(secrets.map((s) => [s.id, s]))
    const resolved: { env: string; placeholder: string; value: string; hosts: string[] }[] = []

    for (const mount of mounts) {
      const secret = secretMap.get(mount.secretId)
      if (secret) {
        resolved.push({
          env: mount.envVar,
          placeholder: secret.placeholder,
          value: await this.encryptionService.decrypt(secret.encryptedValue),
          hosts: secret.hosts ?? [],
        })
      }
    }

    return resolved
  }

  async remove(secretId: string, organizationId: string): Promise<void> {
    const secret = await this.secretRepository.findOne({
      where: { id: secretId, organizationId },
    })

    if (!secret) {
      throw new NotFoundException(`Secret with ID ${secretId} not found`)
    }

    await this.secretRepository.remove(secret)
  }
}
