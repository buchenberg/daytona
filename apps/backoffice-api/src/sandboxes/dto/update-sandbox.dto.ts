/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { ApiPropertyOptional } from '@nestjs/swagger'
import { IsOptional, IsString, IsBoolean, IsNumber, IsEnum, IsObject } from 'class-validator'
import { Sandbox } from '@api/sandbox/entities/sandbox.entity'
import { SandboxState } from '@api/sandbox/enums/sandbox-state.enum'
import { SandboxDesiredState } from '@api/sandbox/enums/sandbox-desired-state.enum'
import { BackupState } from '@api/sandbox/enums/backup-state.enum'

export class UpdateSandboxDto implements Partial<Sandbox> {
  @ApiPropertyOptional({ description: 'Sandbox state', enum: SandboxState })
  @IsOptional()
  @IsEnum(SandboxState)
  state?: SandboxState

  @ApiPropertyOptional({ description: 'Desired sandbox state', enum: SandboxDesiredState })
  @IsOptional()
  @IsEnum(SandboxDesiredState)
  desiredState?: SandboxDesiredState

  @ApiPropertyOptional({ description: 'Runner ID' })
  @IsOptional()
  @IsString()
  runnerId?: string | null

  @ApiPropertyOptional({ description: 'Error reason' })
  @IsOptional()
  @IsString()
  errorReason?: string | null

  @ApiPropertyOptional({ description: 'Block all network traffic' })
  @IsOptional()
  @IsBoolean()
  networkBlockAll?: boolean

  @ApiPropertyOptional({ description: 'Network allow list' })
  @IsOptional()
  @IsString()
  networkAllowList?: string | null

  @ApiPropertyOptional({ description: 'Labels (key-value pairs)', type: Object })
  @IsOptional()
  @IsObject()
  labels?: Record<string, string>

  @ApiPropertyOptional({ description: 'Backup state', enum: BackupState })
  @IsOptional()
  @IsEnum(BackupState)
  backupState?: BackupState

  @ApiPropertyOptional({ description: 'Backup error reason' })
  @IsOptional()
  @IsString()
  backupErrorReason?: string | null

  @ApiPropertyOptional({ description: 'Auto-stop interval in minutes' })
  @IsOptional()
  @IsNumber()
  autoStopInterval?: number

  @ApiPropertyOptional({ description: 'Auto-archive interval in minutes' })
  @IsOptional()
  @IsNumber()
  autoArchiveInterval?: number

  @ApiPropertyOptional({ description: 'Auto-delete interval in minutes' })
  @IsOptional()
  @IsNumber()
  autoDeleteInterval?: number

  @ApiPropertyOptional({ description: 'Is pending' })
  @IsOptional()
  @IsBoolean()
  pending?: boolean

  @ApiPropertyOptional({ description: 'Authentication token' })
  @IsOptional()
  @IsString()
  authToken?: string

  @ApiPropertyOptional({ description: 'CPU cores' })
  @IsOptional()
  @IsNumber()
  cpu?: number

  @ApiPropertyOptional({ description: 'Memory in GiB' })
  @IsOptional()
  @IsNumber()
  mem?: number

  @ApiPropertyOptional({ description: 'Disk in GiB' })
  @IsOptional()
  @IsNumber()
  disk?: number

  @ApiPropertyOptional({ description: 'Is public' })
  @IsOptional()
  @IsBoolean()
  public?: boolean

  @ApiPropertyOptional({ description: 'Is recoverable' })
  @IsOptional()
  @IsBoolean()
  recoverable?: boolean
}
