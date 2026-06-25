/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { plainToInstance } from 'class-transformer'
import { validate } from 'class-validator'
import { ListAuditLogsQueryDto, MAX_AUDIT_FILTER_RULES } from './list-audit-logs-query.dto'
import { MAX_FILTER_VALUES } from '../../common/constants/filter-limits.constants'
import { buildAuditLogFilter } from '../utils/build-audit-log-filter'
import { BadRequestException } from '@nestjs/common'

async function validateQuery(raw: Record<string, unknown>) {
  const dto = plainToInstance(ListAuditLogsQueryDto, raw, { enableImplicitConversion: true })
  return { dto, errors: await validate(dto) }
}

describe('ListAuditLogsQueryDto', () => {
  describe('legacy from/to', () => {
    it('accepts ISO-8601 date strings', async () => {
      const { dto, errors } = await validateQuery({
        from: '2026-01-01T00:00:00Z',
        to: '2026-02-01T00:00:00Z',
      })
      expect(errors).toEqual([])
      expect(dto.from).toBeInstanceOf(Date)
      expect(dto.to).toBeInstanceOf(Date)
    })

    it('rejects malformed dates', async () => {
      const { errors } = await validateQuery({ from: 'not-a-date' })
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  describe('StringFilter operators', () => {
    it('accepts eq', async () => {
      const { dto, errors } = await validateQuery({ action: { eq: 'create' } })
      expect(errors).toEqual([])
      expect(dto.action?.eq).toBe('create')
    })

    it('accepts not', async () => {
      const { dto, errors } = await validateQuery({ action: { not: 'delete' } })
      expect(errors).toEqual([])
      expect(dto.action?.not).toBe('delete')
    })

    it('parses CSV in[]', async () => {
      const { dto, errors } = await validateQuery({ action: { in: 'create,update,delete' } })
      expect(errors).toEqual([])
      expect(dto.action?.in).toEqual(['create', 'update', 'delete'])
    })

    it('parses repeated array in[]', async () => {
      const { dto, errors } = await validateQuery({ action: { in: ['create', 'update'] } })
      expect(errors).toEqual([])
      expect(dto.action?.in).toEqual(['create', 'update'])
    })

    it('parses mixed CSV+repeated', async () => {
      const { dto, errors } = await validateQuery({ action: { in: ['create,update', 'delete'] } })
      expect(errors).toEqual([])
      expect(dto.action?.in).toEqual(['create', 'update', 'delete'])
    })

    it('drops empty CSV entries', async () => {
      const { dto } = await validateQuery({ action: { in: 'create,,update,' } })
      expect(dto.action?.in).toEqual(['create', 'update'])
    })

    it('rejects in[] over the value cap', async () => {
      const oversized = Array.from({ length: MAX_FILTER_VALUES + 1 }, (_, i) => `v${i}`).join(',')
      const { errors } = await validateQuery({ action: { in: oversized } })
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  describe('IntFilter operators', () => {
    it('accepts eq', async () => {
      const { dto, errors } = await validateQuery({ statusCode: { eq: '200' } })
      expect(errors).toEqual([])
      expect(dto.statusCode?.eq).toBe(200)
    })

    it('accepts range operators', async () => {
      const { dto, errors } = await validateQuery({
        statusCode: { gte: '400', lt: '500' },
      })
      expect(errors).toEqual([])
      expect(dto.statusCode?.gte).toBe(400)
      expect(dto.statusCode?.lt).toBe(500)
    })

    it('parses CSV in[]', async () => {
      const { dto, errors } = await validateQuery({ statusCode: { in: '200,201,202' } })
      expect(errors).toEqual([])
      expect(dto.statusCode?.in).toEqual([200, 201, 202])
    })

    it('rejects non-numeric in[] entries', async () => {
      const { errors } = await validateQuery({ statusCode: { in: '200,not-a-number' } })
      expect(errors.length).toBeGreaterThan(0)
    })
  })

  describe('DateFilter operators', () => {
    it('accepts range bounds', async () => {
      const { dto, errors } = await validateQuery({
        createdAt: {
          gte: '2026-01-01T00:00:00Z',
          lte: '2026-02-01T00:00:00Z',
        },
      })
      expect(errors).toEqual([])
      expect(dto.createdAt?.gte).toBeInstanceOf(Date)
      expect(dto.createdAt?.lte).toBeInstanceOf(Date)
    })
  })

  describe('rule count cap (enforced by buildAuditLogFilter)', () => {
    it('passes when within cap', async () => {
      const { dto, errors } = await validateQuery({
        action: { eq: 'create', not: 'delete' },
        actorEmail: { in: 'a@x.com,b@x.com' },
      })
      expect(errors).toEqual([])
      expect(() => buildAuditLogFilter(dto)).not.toThrow()
    })

    it(`rejects more than ${MAX_AUDIT_FILTER_RULES} active rules`, async () => {
      const overCap = {
        action: { eq: 'a', not: 'b' },
        actorEmail: { eq: 'c', not: 'd' },
        actorId: { eq: 'e', not: 'f' },
        targetType: { eq: 'g', not: 'h' },
        targetId: { eq: 'i', not: 'j' },
        id: { eq: 'k' },
      }
      const { dto, errors } = await validateQuery(overCap)
      expect(errors).toEqual([])
      expect(() => buildAuditLogFilter(dto)).toThrow(BadRequestException)
      expect(() => buildAuditLogFilter(dto)).toThrow(/Too many filter rules/i)
    })

    it('does not count empty in[]/notIn[] arrays as active rules', async () => {
      const { dto, errors } = await validateQuery({
        action: { in: [] },
        actorEmail: { notIn: [] },
        id: { eq: 'log-1' },
      })
      expect(errors).toEqual([])
      const built = buildAuditLogFilter(dto)
      expect(built.id?.eq).toBe('log-1')
    })
  })
})
