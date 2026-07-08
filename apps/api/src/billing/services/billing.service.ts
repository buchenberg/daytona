/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { BillingInfoApi, Configuration } from '@daytona/billing-api-client'
import axios from 'axios'
import { InjectRedis } from '@nestjs-modules/ioredis'
import { Redis } from 'ioredis'
import { TypedConfigService } from '../../config/typed-config.service'

const GPU_ACCESS_CACHE_TTL_SECONDS = 60

@Injectable()
export class BillingService {
  private readonly billingInfoApi: BillingInfoApi | null

  constructor(
    private readonly configService: TypedConfigService,
    @InjectRedis() private readonly redis: Redis,
  ) {
    const billingApiUrl = this.configService.get('billingApiUrl')

    if (billingApiUrl) {
      const adminApiKey = this.configService.getOrThrow('billing.adminApiKey')
      const billingConfig = new Configuration({
        basePath: billingApiUrl,
        accessToken: adminApiKey,
        baseOptions: {
          headers: {
            Authorization: `Bearer ${adminApiKey}`,
          },
        },
      })
      this.billingInfoApi = new BillingInfoApi(billingConfig, undefined, axios.create())
    } else {
      this.billingInfoApi = null
    }
  }

  get enabled(): boolean {
    return this.billingInfoApi !== null
  }

  async hasGpuAccess(organizationId: string): Promise<boolean> {
    if (!this.billingInfoApi) {
      throw new Error('Billing is not enabled')
    }

    const cacheKey = `billing:gpu-access:${organizationId}`
    const cached = await this.redis.get(cacheKey)
    if (cached !== null) {
      return cached === '1'
    }

    const response = await this.billingInfoApi.validateGpuAccess(organizationId)
    const hasGpuCredits = response.data.hasGpuCredits === true

    await this.redis.set(cacheKey, hasGpuCredits ? '1' : '0', 'EX', GPU_ACCESS_CACHE_TTL_SECONDS)

    return hasGpuCredits
  }
}
