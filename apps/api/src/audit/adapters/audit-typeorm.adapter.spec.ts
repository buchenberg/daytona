import { AuditTypeormStorageAdapter } from './audit-typeorm.adapter'
import { AuditLog } from '../entities/audit-log.entity'
import { AuditLogFilter } from '../interfaces/audit-filter.interface'
import { Repository } from 'typeorm'

interface CapturedFind {
  options?: any
}

function makeAdapter() {
  const captured: CapturedFind = {}
  const repo = {
    findAndCount: jest.fn((options: any) => {
      captured.options = options
      return Promise.resolve([[], 0])
    }),
  } as unknown as Repository<AuditLog>
  const adapter = new AuditTypeormStorageAdapter(repo)
  return { adapter, captured, repo }
}

function getOperatorType(op: any): string {
  return op?.type ?? op?.constructor?.name ?? typeof op
}

function unwrapAnd(op: any): any[] {
  if (op?.type === 'and') return op.value as any[]
  return [op]
}

async function getWhere(filters?: AuditLogFilter, organizationId = 'org-1') {
  const { adapter, captured } = makeAdapter()
  await adapter.getOrganizationLogs(organizationId, 1, 10, filters)
  if (!captured.options) throw new Error('findAndCount was not called')
  return captured.options.where as Record<string, any>
}

describe('AuditTypeormStorageAdapter where clause construction', () => {
  describe('organization scope (no extra filters)', () => {
    it('scopes by organizationId and excludes system actor', async () => {
      const where = await getWhere(undefined, 'org-42')
      expect(where.organizationId).toBe('org-42')
      expect(getOperatorType(where.actorId)).toBe('not')
    })
  })

  describe('legacy from/to date range', () => {
    it('translates from/to into createdAt range', async () => {
      const from = new Date('2026-01-01T00:00:00Z')
      const to = new Date('2026-02-01T00:00:00Z')
      const where = await getWhere({ from, to })
      const ops = unwrapAnd(where.createdAt)
      const types = ops.map(getOperatorType)
      expect(types).toContain('moreThanOrEqual')
      expect(types).toContain('lessThanOrEqual')
    })
  })

  describe('createdAt filter', () => {
    it('emits all four range bounds when present', async () => {
      const where = await getWhere({
        createdAt: {
          gte: new Date('2026-01-01T00:00:00Z'),
          lte: new Date('2026-02-01T00:00:00Z'),
          gt: new Date('2026-01-15T00:00:00Z'),
          lt: new Date('2026-01-20T00:00:00Z'),
        },
      })
      const types = unwrapAnd(where.createdAt).map(getOperatorType)
      expect(types).toEqual(expect.arrayContaining(['moreThanOrEqual', 'lessThanOrEqual', 'moreThan', 'lessThan']))
    })

    it('createdAt.gte takes precedence over legacy from when both are present', async () => {
      const where = await getWhere({
        from: new Date('2025-01-01T00:00:00Z'),
        createdAt: { gte: new Date('2026-06-01T00:00:00Z') },
      })
      const ops = unwrapAnd(where.createdAt).filter((op) => getOperatorType(op) === 'moreThanOrEqual')
      expect(ops).toHaveLength(1)
      expect(ops[0].value).toEqual(new Date('2026-06-01T00:00:00Z'))
    })
  })

  describe('StringFilter operators', () => {
    it('eq -> Equal', async () => {
      const where = await getWhere({ action: { eq: 'create' } })
      expect(getOperatorType(where.action)).toBe('equal')
      expect(where.action.value).toBe('create')
    })

    it('not -> Not(Equal)', async () => {
      const where = await getWhere({ action: { not: 'delete' } })
      expect(getOperatorType(where.action)).toBe('not')
    })

    it('in -> In', async () => {
      const where = await getWhere({ action: { in: ['a', 'b'] } })
      expect(getOperatorType(where.action)).toBe('in')
      expect(where.action.value).toEqual(['a', 'b'])
    })

    it('notIn -> Not(In)', async () => {
      const where = await getWhere({ action: { notIn: ['a', 'b'] } })
      expect(getOperatorType(where.action)).toBe('not')
    })

    it('combines multiple operators with And()', async () => {
      const where = await getWhere({
        action: { eq: 'create', not: 'delete', in: ['a', 'b'], notIn: ['c', 'd'] },
      })
      expect(getOperatorType(where.action)).toBe('and')
      expect((where.action.value as any[]).length).toBe(4)
    })
  })

  describe('IntFilter operators', () => {
    it('emits all eight operators when supplied', async () => {
      const where = await getWhere({
        statusCode: { eq: 200, not: 500, in: [201, 202], notIn: [503], gte: 200, lte: 599, gt: 199, lt: 600 },
      })
      expect(getOperatorType(where.statusCode)).toBe('and')
      expect((where.statusCode.value as any[]).length).toBe(8)
    })
  })

  describe('actorId composition with system-actor exclusion', () => {
    it('ANDs user-supplied actorId filter with the system-actor exclusion', async () => {
      const where = await getWhere({ actorId: { eq: 'usr-1' } })
      expect(getOperatorType(where.actorId)).toBe('and')
      const ops = (where.actorId.value as any[]).map(getOperatorType)
      expect(ops).toContain('not')
      expect(ops).toContain('equal')
    })
  })

  describe('getAllLogs (no organization scope)', () => {
    it('does not include organizationId in where clause', async () => {
      const { adapter, captured } = makeAdapter()
      await adapter.getAllLogs(1, 10, { action: { eq: 'create' } })
      if (!captured.options) throw new Error('findAndCount was not called')
      const where = captured.options.where as Record<string, any>
      expect(where.organizationId).toBeUndefined()
      expect(getOperatorType(where.action)).toBe('equal')
    })
  })
})
