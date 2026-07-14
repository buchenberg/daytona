import { ApiProperty, ApiSchema } from '@nestjs/swagger'

@ApiSchema({ name: 'UpdateOrganizationQuota' })
export class UpdateOrganizationQuotaDto {
  @ApiProperty({ nullable: true })
  maxCpuPerSandbox?: number

  @ApiProperty({ nullable: true })
  maxMemoryPerSandbox?: number

  @ApiProperty({ nullable: true })
  maxDiskPerSandbox?: number

  @ApiProperty({ nullable: true })
  snapshotQuota?: number

  @ApiProperty({ nullable: true })
  maxSnapshotSize?: number

  @ApiProperty({ nullable: true })
  volumeQuota?: number

  @ApiProperty({ nullable: true })
  secretQuota?: number

  @ApiProperty({ nullable: true, description: 'Maximum number of secrets that can be mounted to a single sandbox' })
  maxSecretsPerSandbox?: number

  @ApiProperty({ nullable: true })
  authenticatedRateLimit?: number

  @ApiProperty({ nullable: true })
  sandboxCreateRateLimit?: number

  @ApiProperty({ nullable: true })
  sandboxLifecycleRateLimit?: number

  @ApiProperty({ nullable: true })
  authenticatedRateLimitTtlSeconds?: number

  @ApiProperty({ nullable: true })
  sandboxCreateRateLimitTtlSeconds?: number

  @ApiProperty({ nullable: true })
  sandboxLifecycleRateLimitTtlSeconds?: number

  @ApiProperty({ nullable: true, description: 'Time in minutes before an unused snapshot is deactivated' })
  snapshotDeactivationTimeoutMinutes?: number

  @ApiProperty({
    nullable: true,
    description:
      'Maximum number of snapshots an organization can process (building or pulling) concurrently. Excess are queued. <= 0 means unlimited.',
  })
  maxConcurrentSnapshotProcessing?: number
}
