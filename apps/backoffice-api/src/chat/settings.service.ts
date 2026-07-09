/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { Injectable } from '@nestjs/common'
import { ConfigService } from '@nestjs/config'
import { InjectRepository } from '@nestjs/typeorm'
import { Repository } from 'typeorm'
import { UserSettings } from './entities/user-settings.entity'
import {
  ClickhouseOverride,
  DatabaseOverride,
  DatasourceOverrides,
  GrafanaOverride,
  OpensearchOverride,
  PosthogOverride,
  SandboxOverride,
} from './dto/datasource-overrides.dto'
import { UpdateSettingsDto } from './dto/update-settings.dto'
import { encryptAll, decryptAll, redactAll, MASK, SECRET_FIELDS, SecretKeys } from './encryption/secrets'

/**
 * Effective config for a datasource: the override shape plus a non-optional
 * `disabled` flag. When `disabled` is true, all other fields are absent —
 * services must check `disabled` first and throw `DatasourceDisabledError`
 * before use.
 */
export type EffectiveConfig<O> = Readonly<Omit<O, 'disabled'> & { disabled: boolean }>

export type EffectiveDatabaseConfig = EffectiveConfig<DatabaseOverride>
export type EffectiveClickhouseConfig = EffectiveConfig<ClickhouseOverride>
export type EffectiveOpensearchConfig = EffectiveConfig<OpensearchOverride>
export type EffectiveGrafanaConfig = EffectiveConfig<GrafanaOverride>
export type EffectivePosthogConfig = EffectiveConfig<PosthogOverride>
export type EffectiveSandboxConfig = EffectiveConfig<SandboxOverride>

// Shared "disabled" effective config — valid for every source since all other
// fields are optional.
const DISABLED = Object.freeze({ disabled: true })

// How long decrypted overrides are cached in-process before we re-read + re-decrypt.
// Also bounds how long a raw SQL edit to `datasource_overrides` takes to land
// (API-driven `update()` calls clear the cache immediately and don't wait for TTL).
const OVERRIDES_TTL_MS = 60_000

@Injectable()
export class SettingsService {
  // Per-user cache of *decrypted* overrides. Absorbs the 6-PBKDF2 amplification
  // that would otherwise fire on every getEffective<X>Config call during a
  // single Mali turn.
  private readonly overridesCache = new Map<string, { overrides: DatasourceOverrides; expiresAt: number }>()

  constructor(
    @InjectRepository(UserSettings, 'backoffice')
    private readonly settingsRepo: Repository<UserSettings>,
    private readonly configService: ConfigService,
  ) {}

  // ─── Public HTTP surface ────────────────────────────────────────────────

  /** Returns the user's overrides with every secret field replaced by `MASK` if set. */
  async get(userId: string): Promise<{ datasourceOverrides: DatasourceOverrides }> {
    const settings = await this.settingsRepo.findOne({ where: { userId } })
    return { datasourceOverrides: redactAll(settings?.datasourceOverrides ?? {}) }
  }

  /**
   * Upsert user settings. An explicit `{<source>: {}}` disables the source
   * (normalized to `{disabled: true}`). Omitted sources keep their stored
   * value; included sources replace it wholesale except that secret fields
   * arriving as `MASK` borrow the previously-stored encrypted value.
   */
  async update(userId: string, body: UpdateSettingsDto): Promise<{ success: true }> {
    const existing = await this.settingsRepo.findOne({ where: { userId } })
    const stored = existing?.datasourceOverrides ?? {}
    const incoming = body.datasourceOverrides ?? {}

    const applied: DatasourceOverrides = {
      database: applyOne(stored.database, incoming.database, SECRET_FIELDS.database),
      clickhouse: applyOne(stored.clickhouse, incoming.clickhouse, SECRET_FIELDS.clickhouse),
      opensearch: applyOne(stored.opensearch, incoming.opensearch, SECRET_FIELDS.opensearch),
      grafana: applyOne(stored.grafana, incoming.grafana, SECRET_FIELDS.grafana),
      posthog: applyOne(stored.posthog, incoming.posthog, SECRET_FIELDS.posthog),
      sandbox: applyOne(stored.sandbox, incoming.sandbox, SECRET_FIELDS.sandbox),
    }

    await this.settingsRepo.save({ userId, datasourceOverrides: encryptAll(normalizeAll(applied)) })

    // Invalidate immediately so the user's next Mali turn re-resolves without
    // waiting for the TTL. Tool services pick up new config via their own
    // per-hash pools — if the new hash isn't live they'll build a pool, if it
    // matches another user's pool they'll just join it.
    this.overridesCache.delete(userId)
    return { success: true }
  }

  // ─── Effective-config helpers (used by datasource services) ─────────────

  async getEffectiveDatabaseConfig(userId: string): Promise<EffectiveDatabaseConfig> {
    const user = (await this.loadOverrides(userId)).database
    if (user?.disabled) return DISABLED
    if (user) return Object.freeze({ ...user, disabled: false })
    return Object.freeze({
      disabled: false,
      host: this.configService.get<string>('mali.database.host') || undefined,
      port: this.configService.get<number>('mali.database.port'),
      username: this.configService.get<string>('mali.database.username') || undefined,
      password: this.configService.get<string>('mali.database.password') || undefined,
      database: this.configService.get<string>('mali.database.database') || undefined,
      tls: {
        enabled: this.configService.get<boolean>('mali.database.tls.enabled'),
        rejectUnauthorized: this.configService.get<boolean>('mali.database.tls.rejectUnauthorized'),
      },
    })
  }

  async getEffectiveClickhouseConfig(userId: string): Promise<EffectiveClickhouseConfig> {
    const user = (await this.loadOverrides(userId)).clickhouse
    if (user?.disabled) return DISABLED
    if (user) return Object.freeze({ ...user, disabled: false })
    return Object.freeze({
      disabled: false,
      serviceId: this.configService.get<string>('mali.clickhouse.serviceId') || undefined,
      keyId: this.configService.get<string>('mali.clickhouse.keyId') || undefined,
      keySecret: this.configService.get<string>('mali.clickhouse.keySecret') || undefined,
    })
  }

  async getEffectiveOpensearchConfig(userId: string): Promise<EffectiveOpensearchConfig> {
    const user = (await this.loadOverrides(userId)).opensearch
    if (user?.disabled) return DISABLED
    if (user) return Object.freeze({ ...user, disabled: false })
    return this.getEnvOpensearchConfig()
  }

  /** Env-only OpenSearch config, ignoring user overrides — for system-context callers. */
  getEnvOpensearchConfig(): EffectiveOpensearchConfig {
    return Object.freeze({
      disabled: false,
      url: this.configService.get<string>('mali.opensearch.url') || undefined,
      username: this.configService.get<string>('mali.opensearch.username') || undefined,
      password: this.configService.get<string>('mali.opensearch.password') || undefined,
    })
  }

  async getEffectiveGrafanaConfig(userId: string): Promise<EffectiveGrafanaConfig> {
    const user = (await this.loadOverrides(userId)).grafana
    if (user?.disabled) return DISABLED
    if (user) return Object.freeze({ ...user, disabled: false })
    return Object.freeze({
      disabled: false,
      url: this.configService.get<string>('mali.grafana.url') || undefined,
      token: this.configService.get<string>('mali.grafana.token') || undefined,
    })
  }

  async getEffectivePosthogConfig(userId: string): Promise<EffectivePosthogConfig> {
    const user = (await this.loadOverrides(userId)).posthog
    if (user?.disabled) return DISABLED
    if (user) return Object.freeze({ ...user, disabled: false })
    return Object.freeze({
      disabled: false,
      host: this.configService.get<string>('mali.posthog.host') || undefined,
      apiKey: this.configService.get<string>('mali.posthog.apiKey') || undefined,
      projectId: this.configService.get<string>('mali.posthog.projectId') || undefined,
    })
  }

  async getEffectiveSandboxConfig(userId: string): Promise<EffectiveSandboxConfig> {
    const user = (await this.loadOverrides(userId)).sandbox
    if (user?.disabled) return DISABLED
    if (user) return Object.freeze({ ...user, disabled: false })
    return Object.freeze({
      disabled: false,
      // No env fallback for the Daytona API key — sandbox tools always require
      // a per-user key.
      daytonaApiKey: undefined,
      githubRepoUrl: this.configService.get<string>('mali.sandbox.githubRepoUrl') || undefined,
      githubPat: this.configService.get<string>('mali.sandbox.githubPat') || undefined,
    })
  }

  // ─── Internals ──────────────────────────────────────────────────────────

  /**
   * Load a user's decrypted datasource overrides, using a short in-memory TTL
   * cache. One DB round-trip + one decryptAll per user per TTL window — all
   * six `getEffective<X>Config` helpers share this.
   *
   * Raw SQL edits to `datasource_overrides` propagate within `OVERRIDES_TTL_MS`
   * (no restart needed). API-driven `update()` calls clear the entry
   * immediately so they land on the very next turn.
   */
  private async loadOverrides(userId: string): Promise<DatasourceOverrides> {
    const cached = this.overridesCache.get(userId)
    if (cached && cached.expiresAt > Date.now()) return cached.overrides

    const row = await this.settingsRepo.findOne({ where: { userId } })
    const overrides = decryptAll(row?.datasourceOverrides ?? {})
    this.overridesCache.set(userId, { overrides, expiresAt: Date.now() + OVERRIDES_TTL_MS })
    return overrides
  }
}

// ─── File-local helpers ─────────────────────────────────────────────────

/**
 * Apply an incoming source-level override on top of the stored one.
 *   - incoming === undefined (source absent from payload) → keep stored as-is
 *   - incoming is present (even `{}`) → replace stored wholesale, except
 *     secret fields arriving as MASK borrow the stored (encrypted) value.
 */
function applyOne<T extends { disabled?: boolean }>(
  stored: T | undefined,
  incoming: T | undefined,
  secretFields: ReadonlyArray<SecretKeys<T>>,
): T | undefined {
  if (incoming === undefined) return stored
  const out: T = { ...incoming }
  for (const f of secretFields) {
    if (incoming[f] === MASK) {
      if (stored && f in stored) out[f] = stored[f]
      else delete out[f]
    }
  }
  return out
}

/** An empty object for a source is UX sugar for "disable this source". */
function normalizeOne<T extends { disabled?: boolean }>(v: T | undefined): T | { disabled: true } | undefined {
  if (!v) return undefined
  if (v.disabled) return v
  return Object.keys(v).length === 0 ? { disabled: true } : v
}

function normalizeAll(o: DatasourceOverrides): DatasourceOverrides {
  return {
    database: normalizeOne(o.database),
    clickhouse: normalizeOne(o.clickhouse),
    opensearch: normalizeOne(o.opensearch),
    grafana: normalizeOne(o.grafana),
    posthog: normalizeOne(o.posthog),
    sandbox: normalizeOne(o.sandbox),
  }
}
