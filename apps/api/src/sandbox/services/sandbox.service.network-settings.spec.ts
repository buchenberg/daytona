/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Repository } from 'typeorm'
import { EventEmitter2 } from '@nestjs/event-emitter'
import { Redis } from 'ioredis'

import { SandboxService } from './sandbox.service'
import { SandboxRepository } from '../repositories/sandbox.repository'
import { SnapshotRepository } from '../repositories/snapshot.repository'
import { Sandbox } from '../entities/sandbox.entity'
import { SandboxState } from '../enums/sandbox-state.enum'
import { SandboxDesiredState } from '../enums/sandbox-desired-state.enum'
import { Runner } from '../entities/runner.entity'
import { SshAccess } from '../entities/ssh-access.entity'
import { SandboxFork } from '../entities/sandbox-fork.entity'
import { RunnerService } from './runner.service'
import { VolumeService } from './volume.service'
import { TypedConfigService } from '../../config/typed-config.service'
import { SandboxWarmPoolService } from './sandbox-warm-pool.service'
import { OrganizationService } from '../../organization/services/organization.service'
import { RunnerAdapterFactory } from '../runner-adapter/runnerAdapter'
import { OrganizationUsageService } from '../../organization/services/organization-usage.service'
import { RedisLockProvider } from '../common/redis-lock.provider'
import { RegionService } from '../../region/services/region.service'
import { SnapshotService } from './snapshot.service'
import { SandboxLookupCacheInvalidationService } from './sandbox-lookup-cache-invalidation.service'
import { SandboxActivityService } from './sandbox-activity.service'
import { DockerRegistryService } from '../../docker-registry/services/docker-registry.service'
import { SandboxSearchAdapter } from '../interfaces/sandbox-search.interface'
import { BadRequestError } from '../../exceptions/bad-request.exception'
import { SecretService } from '../../secret/services/secret.service'
import { SandboxSecret } from '../entities/sandbox-secret.entity'
import { BuildInfoService } from './build-info.service'
import { BillingService } from '../../billing/services/billing.service'

type SandboxFixture = Partial<Sandbox>

describe('SandboxService.updateNetworkSettings', () => {
  let service: SandboxService

  let sandboxFindOne: jest.Mock
  let sandboxUpdate: jest.Mock
  let runnerFindOne: jest.Mock
  let runnerAdapterCreate: jest.Mock
  let runnerAdapterUpdateNetworkSettings: jest.Mock

  const buildFixture = (overrides: SandboxFixture = {}): Sandbox =>
    ({
      id: 'sb-1',
      organizationId: 'org-1',
      state: SandboxState.STARTED,
      desiredState: SandboxDesiredState.STARTED,
      runnerId: null,
      networkBlockAll: false,
      networkAllowList: undefined,
      domainAllowList: undefined,
      ...overrides,
    }) as unknown as Sandbox

  const newServiceWithSandbox = (fixture: Sandbox): SandboxService => {
    sandboxFindOne = jest.fn().mockResolvedValue(fixture)
    sandboxUpdate = jest.fn().mockImplementation(async (_id, params) => ({
      ...fixture,
      ...params.updateData,
    }))
    runnerFindOne = jest.fn()
    runnerAdapterUpdateNetworkSettings = jest.fn().mockResolvedValue(undefined)
    runnerAdapterCreate = jest.fn().mockResolvedValue({
      updateNetworkSettings: runnerAdapterUpdateNetworkSettings,
    })

    const sandboxRepository = { findOne: sandboxFindOne, update: sandboxUpdate }
    const runnerService = { findOne: runnerFindOne }
    const runnerAdapterFactory = { create: runnerAdapterCreate }

    return new SandboxService(
      sandboxRepository as unknown as SandboxRepository,
      undefined as unknown as SnapshotRepository,
      undefined as unknown as Repository<Runner>,
      undefined as unknown as Repository<SshAccess>,
      runnerService as unknown as RunnerService,
      undefined as unknown as VolumeService,
      undefined as unknown as TypedConfigService,
      undefined as unknown as SandboxWarmPoolService,
      undefined as unknown as EventEmitter2,
      undefined as unknown as OrganizationService,
      runnerAdapterFactory as unknown as RunnerAdapterFactory,
      undefined as unknown as OrganizationUsageService,
      undefined as unknown as RedisLockProvider,
      undefined as unknown as Redis,
      undefined as unknown as RegionService,
      undefined as unknown as SnapshotService,
      undefined as unknown as SandboxLookupCacheInvalidationService,
      undefined as unknown as SandboxActivityService,
      undefined as unknown as DockerRegistryService,
      undefined as unknown as Repository<SandboxFork>,
      undefined as unknown as SandboxSearchAdapter,
      undefined as unknown as SecretService,
      undefined as unknown as Repository<SandboxSecret>,
      undefined as unknown as BuildInfoService,
      undefined as unknown as BillingService,
    )
  }

  describe('conflict assertion (rejects contradictory input upfront)', () => {
    it.each([
      ['blockAll=true + non-empty networkAllowList', true, '10.0.0.0/24', undefined],
      ['blockAll=true + non-empty domainAllowList', true, undefined, 'example.com'],
      ['blockAll=true + both lists', true, '10.0.0.0/24', 'example.com'],
    ])(
      '%s rejects with 400 BadRequestError and does not touch the database',
      async (_label, blockAll, network, domain) => {
        service = newServiceWithSandbox(buildFixture())

        await expect(
          service.updateNetworkSettings('sb-1', blockAll as boolean, network, domain, 'org-1'),
        ).rejects.toThrow(BadRequestError)

        expect(sandboxFindOne).not.toHaveBeenCalled()
        expect(sandboxUpdate).not.toHaveBeenCalled()
        expect(runnerAdapterCreate).not.toHaveBeenCalled()
      },
    )

    it.each([
      ['blockAll=undefined + both lists', undefined, '10.0.0.0/24', 'example.com'],
      ['blockAll=false + both lists', false, '10.0.0.0/24', 'example.com'],
    ])(
      '%s rejects with 400 BadRequestError (networkAllowList and domainAllowList are mutually exclusive)',
      async (_label, blockAll, network, domain) => {
        service = newServiceWithSandbox(buildFixture())

        await expect(
          service.updateNetworkSettings('sb-1', blockAll as boolean | undefined, network, domain, 'org-1'),
        ).rejects.toThrow(BadRequestError)

        expect(sandboxFindOne).not.toHaveBeenCalled()
        expect(sandboxUpdate).not.toHaveBeenCalled()
        expect(runnerAdapterCreate).not.toHaveBeenCalled()
      },
    )

    it.each([
      ['blockAll=true + empty networkAllowList', true, '', undefined],
      ['blockAll=true + whitespace networkAllowList', true, '   ', undefined],
      ['blockAll=true + empty domainAllowList', true, undefined, ''],
      ['blockAll=true alone', true, undefined, undefined],
    ])(
      '%s does not trigger conflict (empty/whitespace counts as no allow-list)',
      async (_label, blockAll, network, domain) => {
        service = newServiceWithSandbox(buildFixture())

        await expect(
          service.updateNetworkSettings('sb-1', blockAll as boolean, network, domain, 'org-1'),
        ).resolves.toBeDefined()
      },
    )
  })

  describe('empty-string allow-lists clear the persisted value', () => {
    it('networkAllowList="" persists null', async () => {
      service = newServiceWithSandbox(buildFixture({ networkAllowList: '10.0.0.0/24' }))

      await service.updateNetworkSettings('sb-1', undefined, '', undefined, 'org-1')

      const [, { updateData }] = sandboxUpdate.mock.calls[0]
      expect(updateData.networkAllowList).toBeNull()
    })

    it('domainAllowList="   " (whitespace) persists null', async () => {
      service = newServiceWithSandbox(buildFixture({ domainAllowList: 'example.com' }))

      await service.updateNetworkSettings('sb-1', undefined, undefined, '   ', 'org-1')

      const [, { updateData }] = sandboxUpdate.mock.calls[0]
      expect(updateData.domainAllowList).toBeNull()
    })
  })

  describe('explicit blockAll=true clears existing allow-lists', () => {
    it('persists null for both lists and propagates undefined to the runner', async () => {
      service = newServiceWithSandbox(
        buildFixture({
          runnerId: 'runner-1',
          networkAllowList: '10.0.0.0/24',
          domainAllowList: 'example.com',
        }),
      )
      runnerFindOne.mockResolvedValue({ id: 'runner-1' } as Runner)

      await service.updateNetworkSettings('sb-1', true, undefined, undefined, 'org-1')

      const [, { updateData }] = sandboxUpdate.mock.calls[0]
      expect(updateData.networkBlockAll).toBe(true)
      expect(updateData.networkAllowList).toBeNull()
      expect(updateData.domainAllowList).toBeNull()

      const runnerArgs = runnerAdapterUpdateNetworkSettings.mock.calls[0]
      expect(runnerArgs[1]).toBe(true)
      expect(runnerArgs[2]).toBeUndefined()
      expect(runnerArgs[4]).toBeUndefined()
    })
  })

  describe('implicit auto-flip when allow-list is added without explicit blockAll', () => {
    it('lifts existing blockAll=true so the new allow-list is not silently ignored', async () => {
      service = newServiceWithSandbox(buildFixture({ networkBlockAll: true }))

      await service.updateNetworkSettings('sb-1', undefined, '10.0.0.0/24', undefined, 'org-1')

      const [, { updateData }] = sandboxUpdate.mock.calls[0]
      expect(updateData.networkBlockAll).toBe(false)
      expect(updateData.networkAllowList).toBe('10.0.0.0/24')
    })

    it('does not toggle blockAll when it is already false', async () => {
      service = newServiceWithSandbox(buildFixture({ networkBlockAll: false }))

      await service.updateNetworkSettings('sb-1', undefined, '10.0.0.0/24', undefined, 'org-1')

      const [, { updateData }] = sandboxUpdate.mock.calls[0]
      expect(updateData.networkBlockAll).toBeUndefined()
      expect(updateData.networkAllowList).toBe('10.0.0.0/24')
    })
  })

  describe('runner stays in sync with the persisted state', () => {
    it('forwards the post-resolution effective values, never the silently-overridden ones', async () => {
      service = newServiceWithSandbox(buildFixture({ runnerId: 'runner-1', networkBlockAll: true }))
      runnerFindOne.mockResolvedValue({ id: 'runner-1' } as Runner)

      await service.updateNetworkSettings('sb-1', undefined, '10.0.0.0/24', undefined, 'org-1')

      const [, { updateData }] = sandboxUpdate.mock.calls[0]
      const runnerArgs = runnerAdapterUpdateNetworkSettings.mock.calls[0]

      expect(updateData.networkBlockAll).toBe(false)
      expect(updateData.networkAllowList).toBe('10.0.0.0/24')

      expect(runnerArgs[1]).toBe(false)
      expect(runnerArgs[2]).toBe('10.0.0.0/24')
    })
  })

  describe('input validation is delegated to the resolver helpers', () => {
    it('rejects an invalid CIDR before touching the database', async () => {
      service = newServiceWithSandbox(buildFixture())

      await expect(service.updateNetworkSettings('sb-1', undefined, 'not-a-cidr', undefined, 'org-1')).rejects.toThrow(
        BadRequestError,
      )

      expect(sandboxUpdate).not.toHaveBeenCalled()
    })

    it('rejects an invalid domain before touching the database', async () => {
      service = newServiceWithSandbox(buildFixture())

      await expect(
        service.updateNetworkSettings('sb-1', undefined, undefined, 'not_a_domain', 'org-1'),
      ).rejects.toThrow(BadRequestError)

      expect(sandboxUpdate).not.toHaveBeenCalled()
    })
  })
})
