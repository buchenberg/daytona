/*
 * Copyright Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

export class SnapshotInitialRunnerReadyEvent {
  constructor(public readonly snapshotId: string) {}
}
