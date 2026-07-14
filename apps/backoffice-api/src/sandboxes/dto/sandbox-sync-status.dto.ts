import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger'

export const SANDBOX_SYNC_DIFF_FIELDS = [
  'state',
  'desiredState',
  'lastActivityAt',
  'errorReason',
  'backupState',
] as const

export type SandboxSyncDiffField = (typeof SANDBOX_SYNC_DIFF_FIELDS)[number]

export type SandboxSyncDiffStatus = 'match' | 'mismatch'

export class SandboxSyncDiffEntryDto {
  @ApiProperty({ enum: SANDBOX_SYNC_DIFF_FIELDS, description: 'The compared field name' })
  field: SandboxSyncDiffField

  @ApiPropertyOptional({
    nullable: true,
    description: 'Normalized DB value as a string; null when the field is unset in the database',
  })
  dbValue: string | null

  @ApiPropertyOptional({
    nullable: true,
    description:
      'Normalized OpenSearch value as a string; null when the field is unset in OpenSearch or the document is missing',
  })
  osValue: string | null

  @ApiProperty({ enum: ['match', 'mismatch'], description: 'Whether the normalized values match' })
  status: SandboxSyncDiffStatus
}

export class SandboxSyncStatusResponseDto {
  @ApiProperty({ description: 'Sandbox identifier' })
  sandboxId: string

  @ApiProperty({ description: 'Owning organization identifier' })
  organizationId: string

  @ApiProperty({ description: 'Server timestamp when both sides were sampled', example: '2026-06-09T12:34:56.789Z' })
  fetchedAt: string

  @ApiProperty({ description: 'Whether OpenSearch returned a document for this sandbox id' })
  osDocumentFound: boolean

  @ApiProperty({ description: 'True only when every diff entry has status "match"' })
  inSync: boolean

  @ApiProperty({ type: [SandboxSyncDiffEntryDto], description: 'Field-by-field comparison' })
  diff: SandboxSyncDiffEntryDto[]

  @ApiProperty({ description: 'Full database row, for the Raw JSON tab', type: Object })
  db: Record<string, unknown>

  @ApiPropertyOptional({
    nullable: true,
    type: Object,
    description: 'Raw OpenSearch _source document; null when osDocumentFound is false',
  })
  opensearch: Record<string, unknown> | null
}
