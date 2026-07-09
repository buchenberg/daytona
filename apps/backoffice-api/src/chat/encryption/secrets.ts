/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { encryptSecret, decryptSecret } from './crypto'
import { DatasourceOverrides } from '../dto/datasource-overrides.dto'

/**
 * Secret-field handling for DatasourceOverrides: `SECRET_FIELDS` is the single
 * source of truth for which fields hold secret values, and the *All helpers
 * apply a transform (encrypt / decrypt / redact) to exactly those fields.
 */

export const DATASOURCES = ['database', 'clickhouse', 'opensearch', 'grafana', 'posthog', 'sandbox'] as const
export type DatasourceName = (typeof DATASOURCES)[number]

/** Keys of `T` that can hold a string — the only shape a secret field may have. */
export type SecretKeys<T> = { [K in keyof T]-?: T[K] extends string | undefined ? K : never }[keyof T]

export const SECRET_FIELDS = {
  database: ['password'],
  clickhouse: ['keyId', 'keySecret'],
  opensearch: ['password'],
  grafana: ['token'],
  posthog: ['apiKey'],
  sandbox: ['daytonaApiKey', 'githubPat'],
} as const satisfies {
  [S in DatasourceName]: ReadonlyArray<SecretKeys<Required<DatasourceOverrides>[S]>>
}

/**
 * Sentinel the UI echoes back for secret fields it doesn't want to change. An
 * incoming secret value equal to this is read as "leave the stored value alone".
 */
export const MASK = '********'

function mapSecrets(overrides: DatasourceOverrides, fn: (value: string) => string): DatasourceOverrides {
  const out: DatasourceOverrides = {}
  for (const source of DATASOURCES) {
    const override = overrides[source]
    if (!override) continue
    const copy: Record<string, unknown> = { ...override }
    for (const field of SECRET_FIELDS[source]) {
      const value = copy[field]
      if (typeof value === 'string') copy[field] = fn(value)
    }
    ;(out as Record<string, unknown>)[source] = copy
  }
  return out
}

export const encryptAll = (o: DatasourceOverrides): DatasourceOverrides => mapSecrets(o, encryptSecret)
export const decryptAll = (o: DatasourceOverrides): DatasourceOverrides => mapSecrets(o, decryptSecret)
export const redactAll = (o: DatasourceOverrides): DatasourceOverrides => mapSecrets(o, () => MASK)
