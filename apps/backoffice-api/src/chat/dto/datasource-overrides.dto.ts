import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsBoolean, IsInt, IsOptional, IsString, ValidateNested } from 'class-validator'
import { Type } from 'class-transformer'

/**
 * Per-user Mali datasource configuration overrides.
 *
 * Stored as a single JSONB blob on `mali_user_settings.datasource_overrides`.
 *
 * Three states per source:
 *   key absent                → fall back to env (MALI_* config)
 *   { disabled: true }        → tool not offered to Claude, blocked at execute
 *   any field set             → override — replaces env for this source entirely
 *                               (no per-field merge; missing fields stay undefined)
 *
 * Secret-valued fields (passwords, tokens, API keys) are stored encrypted as
 * "enc:v1:…" tags; see chat/encryption/crypto.ts.
 */

class DatabaseTlsOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  rejectUnauthorized?: boolean
}

export class DatabaseOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  port?: number

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  database?: string

  @ApiPropertyOptional({ type: DatabaseTlsOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatabaseTlsOverrideDto)
  tls?: DatabaseTlsOverrideDto
}

export class ClickhouseOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  serviceId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keyId?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  keySecret?: string
}

export class OpensearchOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  username?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  password?: string
}

export class GrafanaOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  url?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  token?: string
}

export class PosthogOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  host?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  apiKey?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  projectId?: string
}

export class SandboxOverrideDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  disabled?: boolean

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  daytonaApiKey?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  githubRepoUrl?: string

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  githubPat?: string
}

export class DatasourceOverridesDto {
  @ApiPropertyOptional({ type: DatabaseOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => DatabaseOverrideDto)
  database?: DatabaseOverrideDto

  @ApiPropertyOptional({ type: ClickhouseOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ClickhouseOverrideDto)
  clickhouse?: ClickhouseOverrideDto

  @ApiPropertyOptional({ type: OpensearchOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => OpensearchOverrideDto)
  opensearch?: OpensearchOverrideDto

  @ApiPropertyOptional({ type: GrafanaOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => GrafanaOverrideDto)
  grafana?: GrafanaOverrideDto

  @ApiPropertyOptional({ type: PosthogOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => PosthogOverrideDto)
  posthog?: PosthogOverrideDto

  @ApiPropertyOptional({ type: SandboxOverrideDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => SandboxOverrideDto)
  sandbox?: SandboxOverrideDto
}

// Plain-type aliases used throughout the codebase — the classes above carry
// openapi + class-validator metadata for the controller boundary; everything
// else only cares about the shape.

export type DatabaseOverride = DatabaseOverrideDto
export type ClickhouseOverride = ClickhouseOverrideDto
export type OpensearchOverride = OpensearchOverrideDto
export type GrafanaOverride = GrafanaOverrideDto
export type PosthogOverride = PosthogOverrideDto
export type SandboxOverride = SandboxOverrideDto
export type DatasourceOverrides = DatasourceOverridesDto
