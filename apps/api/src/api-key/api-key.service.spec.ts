/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Repository } from 'typeorm'
import Redis from 'ioredis'
import { ApiKeyService } from './api-key.service'
import { ApiKey } from './api-key.entity'
import { RedisLockProvider } from '../sandbox/common/redis-lock.provider'
import { OrganizationUserRemovedEvent } from '../organization/events/organization-user-removed.event'

describe('ApiKeyService', () => {
  let service: ApiKeyService
  let find: jest.Mock
  let remove: jest.Mock
  let del: jest.Mock

  beforeEach(() => {
    find = jest.fn()
    remove = jest.fn()
    del = jest.fn()
    const repo = { find, manager: { remove } }
    const redis = { del }
    service = new ApiKeyService(
      repo as unknown as Repository<ApiKey>,
      undefined as unknown as RedisLockProvider,
      redis as unknown as Redis,
    )
  })

  describe('handleOrganizationUserRemoved', () => {
    it('revokes every API key the removed user holds in the organization and invalidates their cache', async () => {
      find.mockResolvedValue([
        { organizationId: 'org-1', userId: 'user-1', name: 'k1', keyHash: 'hash-1' },
        { organizationId: 'org-1', userId: 'user-1', name: 'k2', keyHash: 'hash-2' },
      ] as unknown as ApiKey[])

      await service.handleOrganizationUserRemoved(new OrganizationUserRemovedEvent('user-1', 'org-1'))

      // scoped to (organizationId, userId) with NO permission filter — unlike the downgrade path,
      // the member is gone so all of their keys in the org are revoked
      expect(find).toHaveBeenCalledWith({ where: { organizationId: 'org-1', userId: 'user-1' } })
      expect(remove).toHaveBeenCalledTimes(2)
      expect(del).toHaveBeenCalledWith('api-key:validation:hash-1')
      expect(del).toHaveBeenCalledWith('api-key:validation:hash-2')
    })

    it('does nothing when the user has no API keys in the organization', async () => {
      find.mockResolvedValue([])

      await service.handleOrganizationUserRemoved(new OrganizationUserRemovedEvent('user-1', 'org-1'))

      expect(remove).not.toHaveBeenCalled()
      expect(del).not.toHaveBeenCalled()
    })

    it('swallows a load failure so it does not surface on the request that revoked membership', async () => {
      find.mockRejectedValue(new Error('db unavailable'))

      await expect(
        service.handleOrganizationUserRemoved(new OrganizationUserRemovedEvent('user-1', 'org-1')),
      ).resolves.toBeUndefined()
      expect(remove).not.toHaveBeenCalled()
    })

    it('revokes the remaining keys when one deletion fails and logs the failed key', async () => {
      find.mockResolvedValue([
        { organizationId: 'org-1', userId: 'user-1', name: 'k1', keyPrefix: 'dtn', keyHash: 'hash-1' },
        { organizationId: 'org-1', userId: 'user-1', name: 'k2', keyPrefix: 'dtn', keyHash: 'hash-2' },
      ] as unknown as ApiKey[])
      remove.mockImplementation((apiKey: ApiKey) =>
        apiKey.name === 'k1' ? Promise.reject(new Error('row locked')) : Promise.resolve(apiKey),
      )
      const errorLog = jest.spyOn((service as unknown as { logger: { error: jest.Mock } }).logger, 'error')

      await expect(
        service.handleOrganizationUserRemoved(new OrganizationUserRemovedEvent('user-1', 'org-1')),
      ).resolves.toBeUndefined()

      // both deletions are attempted (one failure does not abort the rest)
      expect(remove).toHaveBeenCalledTimes(2)
      // the successful key still had its cache invalidated
      expect(del).toHaveBeenCalledWith('api-key:validation:hash-2')
      // the failed key is logged individually with its identity (name + prefix), never the secret
      const loggedFailure = errorLog.mock.calls.some(
        (args) => typeof args[0] === 'string' && args[0].includes("'k1'") && args[0].includes('prefix=dtn'),
      )
      expect(loggedFailure).toBe(true)
    })
  })
})
