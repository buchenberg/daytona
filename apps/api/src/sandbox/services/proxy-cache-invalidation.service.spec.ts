import Redis from 'ioredis'

import { SandboxEvents } from '../constants/sandbox-events.constants'
import { Sandbox } from '../entities/sandbox.entity'
import { SandboxAuthTokenRotatedEvent } from '../events/sandbox-auth-token-rotated.event'
import { SandboxPublicStatusUpdatedEvent } from '../events/sandbox-public-status-updated.event'
import { SandboxRepository } from '../repositories/sandbox.repository'
import { ProxyCacheInvalidationService } from './proxy-cache-invalidation.service'

describe('ProxyCacheInvalidationService', () => {
  let service: ProxyCacheInvalidationService
  let del: jest.Mock

  const SANDBOX_ID = 'sbx-1'
  const API_KEY = `preview:public:${SANDBOX_ID}`
  const PROXY_KEY = `proxy:sandbox-public:${SANDBOX_ID}`

  const makeEvent = () => new SandboxPublicStatusUpdatedEvent({ id: SANDBOX_ID } as Sandbox, true, false)

  beforeEach(() => {
    del = jest.fn().mockResolvedValue(1)
    service = new ProxyCacheInvalidationService({ del } as unknown as Redis, {} as never)
  })

  describe('handleSandboxPublicStatusUpdated', () => {
    it('evicts both the API-side and the proxy-side public-status caches', async () => {
      await service.handleSandboxPublicStatusUpdated(makeEvent())

      expect(del).toHaveBeenCalledWith(API_KEY)
      expect(del).toHaveBeenCalledWith(PROXY_KEY)
    })

    // Ordering is the correctness property, not an incidental detail: the proxy only
    // re-queries the API on a cache miss, and a miss can only happen after the proxy
    // key is gone. If the proxy key were evicted first, a request landing in the gap
    // would re-read the still-cached API decision and re-populate the proxy's long-lived
    // cache. The API-side key must be evicted first.
    it('evicts the API-side cache before the proxy-side cache', async () => {
      await service.handleSandboxPublicStatusUpdated(makeEvent())

      const apiCallIndex = del.mock.calls.findIndex((args) => args[0] === API_KEY)
      const proxyCallIndex = del.mock.calls.findIndex((args) => args[0] === PROXY_KEY)

      expect(apiCallIndex).toBeGreaterThanOrEqual(0)
      expect(proxyCallIndex).toBeGreaterThanOrEqual(0)
      expect(del.mock.invocationCallOrder[apiCallIndex]).toBeLessThan(del.mock.invocationCallOrder[proxyCallIndex])
    })

    it('evicts the proxy-side cache from every region, including the EU proxy Redis', async () => {
      const euDel = jest.fn().mockResolvedValue(1)
      // proxyEuRedis is populated in onModuleInit from PROXY_EU_REDIS_* config; inject it directly.
      ;(service as unknown as { proxyEuRedis: unknown }).proxyEuRedis = { del: euDel }

      await service.handleSandboxPublicStatusUpdated(makeEvent())

      // The proxy-side public-status cache is per-region; the EU proxy holds its own copy, so a
      // single-region eviction would leave a public→private change stale at the EU proxy.
      expect(del).toHaveBeenCalledWith(PROXY_KEY)
      expect(euDel).toHaveBeenCalledWith(PROXY_KEY)
    })

    it('does NOT evict the proxy-side cache when the API-side eviction fails (avoids re-priming)', async () => {
      del.mockImplementation((key: string) => {
        if (key === API_KEY) {
          return Promise.reject(new Error('redis down'))
        }
        return Promise.resolve(1)
      })

      await expect(service.handleSandboxPublicStatusUpdated(makeEvent())).resolves.not.toThrow()
      // The API entry may still be live; evicting the proxy key would let the next miss re-prime it.
      expect(del).not.toHaveBeenCalledWith(PROXY_KEY)
    })

    it('does not throw when both evictions fail (visibility change must not 500)', async () => {
      del.mockRejectedValue(new Error('redis down'))

      await expect(service.handleSandboxPublicStatusUpdated(makeEvent())).resolves.not.toThrow()
    })
  })
})

describe('[SANDBOX] preview auth token rotation cache invalidation', () => {
  describe('ProxyCacheInvalidationService', () => {
    function createService() {
      const redis = { del: jest.fn().mockResolvedValue(1) }
      const service = new ProxyCacheInvalidationService(redis as never, {} as never)
      return { service, redis }
    }

    it('evicts both the API-side and proxy-side caches for the PREVIOUS token, not the new one', async () => {
      const { service, redis } = createService()

      await service.handleSandboxAuthTokenRotated(
        new SandboxAuthTokenRotatedEvent({ id: 'sandbox-1' } as Sandbox, 'old-token', 'new-token'),
      )

      // Must target the rotated-out token on BOTH cache layers so it stops authorizing immediately.
      // The API-side preview:token cache re-poisons the proxy cache on the next miss if left in place.
      expect(redis.del).toHaveBeenCalledWith('preview:token:sandbox-1:old-token')
      expect(redis.del).toHaveBeenCalledWith('proxy:sandbox-auth-key-valid:sandbox-1:old-token')
      // Deleting the new token would be a no-op and leave the stale entry alive.
      expect(redis.del).not.toHaveBeenCalledWith(expect.stringContaining('new-token'))
    })

    // Ordering is the correctness property: the proxy only re-queries the API on a cache miss,
    // and a miss can only happen after the proxy key is gone. If the proxy key were evicted first,
    // a request landing in the gap would re-validate against the still-cached API decision and
    // re-poison the proxy's longer-lived cache. The API-side key must be evicted first.
    it('evicts the API-side cache before the proxy-side cache', async () => {
      const { service, redis } = createService()

      await service.handleSandboxAuthTokenRotated(
        new SandboxAuthTokenRotatedEvent({ id: 'sandbox-1' } as Sandbox, 'old-token', 'new-token'),
      )

      const apiKey = 'preview:token:sandbox-1:old-token'
      const proxyKey = 'proxy:sandbox-auth-key-valid:sandbox-1:old-token'
      const apiCallIndex = redis.del.mock.calls.findIndex((args) => args[0] === apiKey)
      const proxyCallIndex = redis.del.mock.calls.findIndex((args) => args[0] === proxyKey)

      expect(apiCallIndex).toBeGreaterThanOrEqual(0)
      expect(proxyCallIndex).toBeGreaterThanOrEqual(0)
      expect(redis.del.mock.invocationCallOrder[apiCallIndex]).toBeLessThan(
        redis.del.mock.invocationCallOrder[proxyCallIndex],
      )
    })

    it('evicts the proxy-side cache from every region, including the EU proxy Redis', async () => {
      const { service, redis } = createService()
      const euRedis = { del: jest.fn().mockResolvedValue(1) }
      // proxyEuRedis is populated in onModuleInit from PROXY_EU_REDIS_* config; inject it directly.
      ;(service as unknown as { proxyEuRedis: unknown }).proxyEuRedis = euRedis

      await service.handleSandboxAuthTokenRotated(
        new SandboxAuthTokenRotatedEvent({ id: 'sandbox-1' } as Sandbox, 'old-token', 'new-token'),
      )

      // The proxy-side decision cache is per-region; the EU proxy holds its own copy, so a
      // single-region eviction would leave the rotated token authorizing through the EU proxy.
      const proxyKey = 'proxy:sandbox-auth-key-valid:sandbox-1:old-token'
      expect(redis.del).toHaveBeenCalledWith(proxyKey)
      expect(euRedis.del).toHaveBeenCalledWith(proxyKey)
    })

    it('does nothing when there is no previous token', async () => {
      const { service, redis } = createService()

      await service.handleSandboxAuthTokenRotated(
        new SandboxAuthTokenRotatedEvent({ id: 'sandbox-1' } as Sandbox, '', 'new-token'),
      )

      expect(redis.del).not.toHaveBeenCalled()
    })

    it('does NOT evict the proxy-side cache when the API-side eviction fails (avoids re-priming)', async () => {
      const apiKey = 'preview:token:sandbox-1:old-token'
      const proxyKey = 'proxy:sandbox-auth-key-valid:sandbox-1:old-token'
      const redis = {
        del: jest
          .fn()
          .mockImplementation((key: string) =>
            key === apiKey ? Promise.reject(new Error('redis down')) : Promise.resolve(1),
          ),
      }
      const service = new ProxyCacheInvalidationService(redis as never, {} as never)

      await expect(
        service.handleSandboxAuthTokenRotated(
          new SandboxAuthTokenRotatedEvent({ id: 'sandbox-1' } as Sandbox, 'old-token', 'new-token'),
        ),
      ).resolves.toBeUndefined()

      // The API entry may still be live; evicting the proxy key would let the next miss re-prime it.
      expect(redis.del).not.toHaveBeenCalledWith(proxyKey)
    })

    it('does not throw if redis fails', async () => {
      const redis = { del: jest.fn().mockRejectedValue(new Error('redis down')) }
      const service = new ProxyCacheInvalidationService(redis as never, {} as never)

      await expect(
        service.handleSandboxAuthTokenRotated(
          new SandboxAuthTokenRotatedEvent({ id: 'sandbox-1' } as Sandbox, 'old-token', 'new-token'),
        ),
      ).resolves.toBeUndefined()
    })
  })

  describe('SandboxRepository.emitUpdateEvents', () => {
    function createRepository() {
      const eventEmitter = { emit: jest.fn() }
      const dataSource = { getRepository: jest.fn().mockReturnValue({}) }
      const lookupCache = { invalidate: jest.fn(), invalidateOrgId: jest.fn() }
      const repository = new SandboxRepository(dataSource as never, eventEmitter as never, lookupCache as never)
      return { repository, eventEmitter }
    }

    const base = {
      id: 'sandbox-1',
      state: 'started',
      desiredState: 'started',
      public: false,
      organizationId: 'org-1',
    }

    function rotatedEvents(emit: jest.Mock) {
      return emit.mock.calls.filter((call) => call[0] === SandboxEvents.AUTH_TOKEN_ROTATED)
    }

    it('emits AUTH_TOKEN_ROTATED carrying the previous token when authToken changes', () => {
      const { repository, eventEmitter } = createRepository()

      const previous = { ...base, authToken: 'old-token' }
      const updated = { ...base, authToken: 'new-token' }

      ;(repository as unknown as { emitUpdateEvents: (u: unknown, p: unknown) => void }).emitUpdateEvents(
        updated,
        previous,
      )

      const calls = rotatedEvents(eventEmitter.emit)
      expect(calls).toHaveLength(1)
      const event = calls[0][1] as SandboxAuthTokenRotatedEvent
      expect(event.previousAuthToken).toBe('old-token')
      expect(event.newAuthToken).toBe('new-token')
    })

    it('does not emit AUTH_TOKEN_ROTATED when authToken is unchanged', () => {
      const { repository, eventEmitter } = createRepository()

      const previous = { ...base, authToken: 'same-token' }
      const updated = { ...base, authToken: 'same-token' }

      ;(repository as unknown as { emitUpdateEvents: (u: unknown, p: unknown) => void }).emitUpdateEvents(
        updated,
        previous,
      )

      expect(rotatedEvents(eventEmitter.emit)).toHaveLength(0)
    })
  })
})
