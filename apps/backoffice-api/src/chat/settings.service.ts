/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserSettings } from './entities/user-settings.entity'

@Injectable()
export class SettingsService {
  constructor(
    @InjectRepository(UserSettings, 'backoffice')
    private readonly settingsRepo: Repository<UserSettings>,
  ) {}

  async get(userId: string) {
    const settings = await this.settingsRepo.findOne({ where: { userId } })
    if (!settings) {
      return { daytonaApiKey: null, githubRepoUrl: null, githubPat: null }
    }
    return {
      daytonaApiKey: settings.daytonaApiKey ? '********' : null,
      githubRepoUrl: settings.githubRepoUrl,
      githubPat: settings.githubPat ? '********' : null,
    }
  }

  async update(userId: string, data: Partial<Pick<UserSettings, 'daytonaApiKey' | 'githubRepoUrl' | 'githubPat'>>) {
    const existing = await this.settingsRepo.findOne({ where: { userId } })
    if (existing) {
      if (data.daytonaApiKey !== undefined) existing.daytonaApiKey = data.daytonaApiKey
      if (data.githubRepoUrl !== undefined) existing.githubRepoUrl = data.githubRepoUrl
      if (data.githubPat !== undefined) existing.githubPat = data.githubPat
      await this.settingsRepo.save(existing)
    } else {
      const settings = this.settingsRepo.create({
        userId,
        daytonaApiKey: data.daytonaApiKey ?? null,
        githubRepoUrl: data.githubRepoUrl ?? null,
        githubPat: data.githubPat ?? null,
      })
      await this.settingsRepo.save(settings)
    }
    return { success: true }
  }

  async getDaytonaApiKey(userId: string): Promise<string | null> {
    const settings = await this.settingsRepo.findOne({ where: { userId } })
    return settings?.daytonaApiKey ?? null
  }
}
