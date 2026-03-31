/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ConflictException } from '@nestjs/common'
import { Repository, FindOptionsWhere, ObjectLiteral } from 'typeorm'

/**
 * Performs an atomic UPDATE with preconditions in the WHERE clause.
 * Generates: UPDATE entity SET ...updates WHERE id = ? AND precondition1 = ? AND precondition2 = ?
 *
 * @param T - The TypeORM entity type
 * @param U - The update DTO type (must be a subset of T's keys)
 * @param where - Primary key condition(s)
 * @param updates - Fields to set
 * @param preconditions - Expected current values; update fails with 409 if any don't match
 */
export async function updateWithPreconditions<T extends ObjectLiteral, U extends Partial<T>>(
  repository: Repository<T>,
  where: FindOptionsWhere<T>,
  updates: U,
  preconditions?: Partial<U>,
): Promise<T> {
  // Build WHERE: primary key(s) + preconditions
  const fullWhere: FindOptionsWhere<T> = { ...where }
  if (preconditions) {
    for (const [key, value] of Object.entries(preconditions)) {
      if (value !== undefined) {
        ;(fullWhere as Record<string, unknown>)[key] = value
      }
    }
  }

  const result = await repository.update(fullWhere, updates as Partial<T>)

  if (result.affected === 0) {
    // Entity might not exist, or preconditions failed — check which
    const current = await repository.findOne({ where })

    if (!current) {
      throw new Error('Entity not found')
    }

    // Entity exists but preconditions didn't match
    if (preconditions) {
      const conflicts: { field: string; expected: unknown; current: unknown }[] = []
      for (const [key, expectedValue] of Object.entries(preconditions)) {
        if (expectedValue === undefined) continue
        const currentValue = (current as Record<string, unknown>)[key]
        const normalize = (v: unknown) => (v instanceof Date ? v.toISOString() : v)
        if (normalize(currentValue) !== normalize(expectedValue)) {
          conflicts.push({ field: key, expected: expectedValue, current: currentValue })
        }
      }

      const details = conflicts.map((c) => `'${c.field}': expected '${c.expected}', current '${c.current}'`).join(', ')
      throw new ConflictException({
        message: `Precondition failed: entity was modified since last read. ${details}`,
        conflicts,
      })
    }

    throw new Error('Update failed: no rows affected')
  }

  // Re-fetch updated entity to return
  const updated = await repository.findOne({ where })
  return updated!
}
