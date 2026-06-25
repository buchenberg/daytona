/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { AuditOpenSearchStorageAdapter } from './audit-opensearch.adapter'
import { TypedConfigService } from '../../config/typed-config.service'
import { OpensearchClient } from 'nestjs-opensearch'
import { AuditLogFilter } from '../interfaces/audit-filter.interface'
import { AUDIT_LOG_SYSTEM_ACTOR_ID } from '../constants/audit-log-system-actor.constant'

interface CapturedSearch {
  body?: { query?: any; sort?: any; size?: number; from?: number; search_after?: any }
}

function makeAdapter() {
  const configService = {
    getOrThrow: jest.fn((key: string) => {
      if (key === 'audit.publish.opensearchIndexName') return 'audit-logs'
      throw new Error(`unexpected config key ${key}`)
    }),
    get: jest.fn(),
  } as unknown as TypedConfigService

  const captured: CapturedSearch = {}
  const client = {
    search: jest.fn((args: any) => {
      captured.body = args.body
      return Promise.resolve({
        body: {
          hits: { hits: [], total: { value: 0, relation: 'eq' } },
        },
      })
    }),
    count: jest.fn(() => Promise.resolve({ body: { count: 0 } })),
  } as unknown as OpensearchClient

  const adapter = new AuditOpenSearchStorageAdapter(configService, client)
  return { adapter, captured, client }
}

async function getOrgQuery(filters?: AuditLogFilter, organizationId = 'org-1') {
  const { adapter, captured } = makeAdapter()
  await adapter.getOrganizationLogs(organizationId, 1, 10, filters)
  if (!captured.body) throw new Error('search was not called')
  return captured.body.query
}

describe('AuditOpenSearchStorageAdapter query construction', () => {
  describe('organization query (no extra filters)', () => {
    it('always scopes by organizationId and excludes system actor', async () => {
      const query = await getOrgQuery(undefined, 'org-42')
      expect(query.bool.filter).toContainEqual({ term: { organizationId: 'org-42' } })
      expect(query.bool.must_not).toContainEqual({ term: { actorId: AUDIT_LOG_SYSTEM_ACTOR_ID } })
    })
  })

  describe('legacy from/to date range', () => {
    it('translates from/to into createdAt range clause', async () => {
      const from = new Date('2026-01-01T00:00:00Z')
      const to = new Date('2026-02-01T00:00:00Z')
      const query = await getOrgQuery({ from, to })
      expect(query.bool.filter).toContainEqual({
        range: { createdAt: { gte: from.toISOString(), lte: to.toISOString() } },
      })
    })
  })

  describe('createdAt filter (new)', () => {
    it('uses createdAt.gte / lte / gt / lt directly', async () => {
      const gte = new Date('2026-01-01T00:00:00Z')
      const lte = new Date('2026-02-01T00:00:00Z')
      const gt = new Date('2026-01-15T00:00:00Z')
      const lt = new Date('2026-01-20T00:00:00Z')
      const query = await getOrgQuery({ createdAt: { gte, lte, gt, lt } })
      expect(query.bool.filter).toContainEqual({
        range: {
          createdAt: {
            gte: gte.toISOString(),
            lte: lte.toISOString(),
            gt: gt.toISOString(),
            lt: lt.toISOString(),
          },
        },
      })
    })

    it('createdAt.gte takes precedence over legacy from when both are present', async () => {
      const legacyFrom = new Date('2025-01-01T00:00:00Z')
      const explicit = new Date('2026-06-01T00:00:00Z')
      const query = await getOrgQuery({ from: legacyFrom, createdAt: { gte: explicit } })
      expect(query.bool.filter).toContainEqual({
        range: { createdAt: { gte: explicit.toISOString() } },
      })
    })
  })

  describe('StringFilter operators', () => {
    it('eq -> bool.filter term', async () => {
      const query = await getOrgQuery({ action: { eq: 'create' } })
      expect(query.bool.filter).toContainEqual({ term: { action: 'create' } })
    })

    it('in -> bool.filter terms', async () => {
      const query = await getOrgQuery({ action: { in: ['create', 'update'] } })
      expect(query.bool.filter).toContainEqual({ terms: { action: ['create', 'update'] } })
    })

    it('not -> bool.must_not term', async () => {
      const query = await getOrgQuery({ action: { not: 'delete' } })
      expect(query.bool.must_not).toContainEqual({ term: { action: 'delete' } })
    })

    it('notIn -> bool.must_not terms', async () => {
      const query = await getOrgQuery({ action: { notIn: ['test', 'debug'] } })
      expect(query.bool.must_not).toContainEqual({ terms: { action: ['test', 'debug'] } })
    })

    it('combines all four operators on the same field', async () => {
      const query = await getOrgQuery({
        action: { eq: 'create', not: 'delete', in: ['a', 'b'], notIn: ['c', 'd'] },
      })
      expect(query.bool.filter).toContainEqual({ term: { action: 'create' } })
      expect(query.bool.filter).toContainEqual({ terms: { action: ['a', 'b'] } })
      expect(query.bool.must_not).toContainEqual({ term: { action: 'delete' } })
      expect(query.bool.must_not).toContainEqual({ terms: { action: ['c', 'd'] } })
    })

    it('empty in[] is ignored', async () => {
      const query = await getOrgQuery({ action: { in: [] } })
      expect(JSON.stringify(query.bool.filter)).not.toMatch(/terms.*action/)
    })
  })

  describe('IntFilter operators on statusCode', () => {
    it('emits term/terms/range as appropriate', async () => {
      const query = await getOrgQuery({
        statusCode: { eq: 200, not: 500, in: [201, 202], notIn: [503], gte: 200, lt: 600 },
      })
      expect(query.bool.filter).toContainEqual({ term: { statusCode: 200 } })
      expect(query.bool.filter).toContainEqual({ terms: { statusCode: [201, 202] } })
      expect(query.bool.must_not).toContainEqual({ term: { statusCode: 500 } })
      expect(query.bool.must_not).toContainEqual({ terms: { statusCode: [503] } })
      expect(query.bool.filter).toContainEqual({ range: { statusCode: { gte: 200, lt: 600 } } })
    })
  })

  describe('multi-field composition (AND across fields)', () => {
    it('combines multiple field filters into bool.filter', async () => {
      const query = await getOrgQuery({
        action: { eq: 'create' },
        actorEmail: { in: ['a@x.com'] },
        targetType: { not: 'organization' },
        statusCode: { gte: 400 },
      })
      expect(query.bool.filter).toContainEqual({ term: { action: 'create' } })
      expect(query.bool.filter).toContainEqual({ terms: { actorEmail: ['a@x.com'] } })
      expect(query.bool.must_not).toContainEqual({ term: { targetType: 'organization' } })
      expect(query.bool.filter).toContainEqual({ range: { statusCode: { gte: 400 } } })
    })
  })

  describe('getAllLogs (no organization scope)', () => {
    it('does not add term: organizationId but does exclude system actor', async () => {
      const { adapter, captured } = makeAdapter()
      await adapter.getAllLogs(1, 10, { action: { eq: 'create' } })
      if (!captured.body) throw new Error('search was not called')
      const query = captured.body.query
      expect(JSON.stringify(query.bool.filter)).not.toMatch(/organizationId/)
      expect(query.bool.must_not).toContainEqual({ term: { actorId: AUDIT_LOG_SYSTEM_ACTOR_ID } })
      expect(query.bool.filter).toContainEqual({ term: { action: 'create' } })
    })
  })
})
