import { ConflictException, Injectable, Logger, NotFoundException } from '@nestjs/common'
import { InjectRepository } from '@nestjs/typeorm'
import { EntityManager, Repository, ArrayOverlap } from 'typeorm'
import { ApiKey } from './api-key.entity'
import { OrganizationResourcePermission } from '../organization/enums/organization-resource-permission.enum'
import { RedisLockProvider } from '../sandbox/common/redis-lock.provider'
import { OnAsyncEvent } from '../common/decorators/on-async-event.decorator'
import { OnEvent } from '@nestjs/event-emitter'
import { OrganizationEvents } from '../organization/constants/organization-events.constant'
import { OrganizationResourcePermissionsUnassignedEvent } from '../organization/events/organization-resource-permissions-unassigned.event'
import { OrganizationUserRemovedEvent } from '../organization/events/organization-user-removed.event'
import { InjectRedis } from '@nestjs-modules/ioredis'
import Redis from 'ioredis'
import { generateApiKeyHash, generateApiKeyValue } from '../common/utils/api-key'

@Injectable()
export class ApiKeyService {
  private readonly logger = new Logger(ApiKeyService.name)

  constructor(
    @InjectRepository(ApiKey)
    private apiKeyRepository: Repository<ApiKey>,
    private readonly redisLockProvider: RedisLockProvider,
    @InjectRedis() private readonly redis: Redis,
  ) {}

  private getApiKeyPrefix(value: string): string {
    return value.substring(0, 3)
  }

  private getApiKeySuffix(value: string): string {
    return value.slice(-3)
  }

  async createApiKey(
    organizationId: string,
    userId: string,
    name: string,
    permissions: OrganizationResourcePermission[],
    expiresAt?: Date,
    apiKeyValue?: string,
    createdByKeyHash?: string,
  ): Promise<{ apiKey: ApiKey; value: string }> {
    const existingKey = await this.apiKeyRepository.findOne({ where: { organizationId, userId, name } })
    if (existingKey) {
      throw new ConflictException('API key with this name already exists')
    }

    const value = apiKeyValue || generateApiKeyValue()

    const apiKey = await this.apiKeyRepository.save({
      organizationId,
      userId,
      name,
      keyHash: generateApiKeyHash(value),
      keyPrefix: this.getApiKeyPrefix(value),
      keySuffix: this.getApiKeySuffix(value),
      permissions,
      createdByKeyHash,
      createdAt: new Date(),
      expiresAt,
    })

    return { apiKey, value }
  }

  async getApiKeys(organizationId: string, userId?: string): Promise<ApiKey[]> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { organizationId, userId },
      order: {
        lastUsedAt: {
          direction: 'DESC',
          nulls: 'LAST',
        },
        createdAt: 'DESC',
      },
    })

    return apiKeys
  }

  async getApiKeysCreatedBy(organizationId: string, createdByKeyHash: string): Promise<ApiKey[]> {
    const apiKeys = await this.apiKeyRepository.find({
      where: { organizationId, createdByKeyHash },
      order: {
        lastUsedAt: {
          direction: 'DESC',
          nulls: 'LAST',
        },
        createdAt: 'DESC',
      },
    })

    return apiKeys
  }

  async getApiKeyByName(organizationId: string, userId: string, name: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: {
        organizationId,
        userId,
        name,
      },
    })

    if (!apiKey) {
      throw new NotFoundException('API key not found')
    }

    return apiKey
  }

  async getApiKeyByValue(value: string): Promise<ApiKey> {
    const apiKey = await this.apiKeyRepository.findOne({
      where: {
        keyHash: generateApiKeyHash(value),
      },
    })

    if (!apiKey) {
      throw new NotFoundException('API key not found')
    }

    return apiKey
  }

  async deleteApiKey(organizationId: string, userId: string, name: string): Promise<void> {
    const apiKey = await this.apiKeyRepository.findOne({ where: { organizationId, userId, name } })

    if (!apiKey) {
      throw new NotFoundException('API key not found')
    }

    await this.deleteWithEntityManager(this.apiKeyRepository.manager, apiKey)
  }

  async updateLastUsedAt(organizationId: string, userId: string, name: string, lastUsedAt: Date): Promise<void> {
    const cooldownKey = `api-key-last-used-update-${organizationId}-${userId}-${name}`

    const aquired = await this.redisLockProvider.lock(cooldownKey, 30)

    // redis for cooldown period - 30 seconds
    // prevents database flooding when multiple requests are made at the same time
    if (!aquired) {
      return
    }

    await this.apiKeyRepository.update(
      {
        organizationId,
        userId,
        name,
      },
      { lastUsedAt },
    )
  }

  private async deleteWithEntityManager(entityManager: EntityManager, apiKey: ApiKey): Promise<void> {
    await entityManager.remove(apiKey)
    // Invalidate cache when API key is deleted
    await this.invalidateApiKeyCache(apiKey.keyHash)
  }

  private async invalidateApiKeyCache(keyHash: string): Promise<void> {
    try {
      const cacheKey = `api-key:validation:${keyHash}`
      await this.redis.del(cacheKey)
      this.logger.debug(`Invalidated cache for API key: ${cacheKey}`)
    } catch (error) {
      this.logger.error('Error invalidating API key cache:', error)
    }
  }

  @OnAsyncEvent({
    event: OrganizationEvents.PERMISSIONS_UNASSIGNED,
  })
  async handleOrganizationResourcePermissionsUnassignedEvent(
    payload: OrganizationResourcePermissionsUnassignedEvent,
  ): Promise<void> {
    const apiKeysToRevoke = await this.apiKeyRepository.find({
      where: {
        organizationId: payload.organizationId,
        userId: payload.userId,
        permissions: ArrayOverlap(payload.unassignedPermissions),
      },
    })

    await Promise.all(apiKeysToRevoke.map((apiKey) => this.deleteWithEntityManager(payload.entityManager, apiKey)))
  }

  @OnEvent(OrganizationEvents.USER_REMOVED)
  async handleOrganizationUserRemoved(event: OrganizationUserRemovedEvent): Promise<void> {
    // Membership is revoked: delete the user's API keys for this organization. The keys are not tied to
    // the membership row by a foreign key, and removal does not go through the permission-unassignment
    // path, so without this they keep authenticating and are restored verbatim when the user is re-invited.
    // Best-effort: a failure here must not surface on the request that revoked membership.
    let apiKeys: ApiKey[]
    try {
      apiKeys = await this.apiKeyRepository.find({
        where: {
          organizationId: event.organizationId,
          userId: event.userId,
        },
      })
    } catch (error) {
      this.logger.error(
        `Failed to load API keys to revoke for user ${event.userId} in organization ${event.organizationId}:`,
        error,
      )
      return
    }

    // Revoke every key independently so one failure does not abort the rest, and log each failure with
    // the key identity (never the secret) so an unrevoked key is visible to operators.
    const results = await Promise.allSettled(
      apiKeys.map((apiKey) => this.deleteWithEntityManager(this.apiKeyRepository.manager, apiKey)),
    )
    results.forEach((result, i) => {
      if (result.status === 'rejected') {
        this.logger.error(
          `Failed to revoke API key '${apiKeys[i].name}' (prefix=${apiKeys[i].keyPrefix}) ` +
            `for user ${event.userId} in organization ${event.organizationId}:`,
          result.reason,
        )
      }
    })
  }
}
