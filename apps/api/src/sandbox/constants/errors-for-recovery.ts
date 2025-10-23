/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

// Substrings in an error message that should trigger an automatic restore
export const RECOVERY_ERROR_SUBSTRINGS: string[] = [
    'timeout waiting for daemon to start',
    'sysbox',
    'No such container'
]
