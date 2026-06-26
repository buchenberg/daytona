/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

export interface SecretDto {
  id: string
  name: string
  description?: string
  hosts: string[]
  createdAt: string
  updatedAt: string
}
