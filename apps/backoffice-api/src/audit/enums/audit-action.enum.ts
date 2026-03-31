/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

export enum AuditAction {
  CREATE = 'create',
  READ = 'read',
  UPDATE = 'update',
  DELETE = 'delete',
  SEARCH = 'search',
  BULK_INSERT = 'bulk_insert',
  BULK_UPDATE = 'bulk_update',
  BULK_DELETE = 'bulk_delete',
  PROPAGATE = 'propagate',
  DELETION_PREVIEW = 'deletion_preview',
  IMPORT = 'import',
  LOGIN = 'login',
}
