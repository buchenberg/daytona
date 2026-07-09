/*
 * Copyright 2025 Daytona Platforms Inc.
 * SPDX-License-Identifier: AGPL-3.0
 */

import { MigrationInterface, QueryRunner } from 'typeorm'

/**
 * Add mali_user_settings.datasource_overrides JSONB column, consolidate the
 * three legacy per-user sandbox columns into it, then drop the legacy columns.
 *
 * Consolidation rule: for any row where any of `daytona_api_key`,
 * `github_repo_url`, `github_pat` is non-null, we populate
 * `datasource_overrides.sandbox` with the same values (null-stripped).
 *
 * Secrets are migrated plaintext. Decryption passes plaintext values through
 * unchanged, and any settings update re-encrypts the secret fields it stores —
 * so the migration can run before the master key is deployed without silently
 * losing data.
 */
export class AddDatasourceOverridesToUserSettings1776677836978 implements MigrationInterface {
  name = 'AddDatasourceOverridesToUserSettings1776677836978'

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE mali_user_settings
      ADD COLUMN datasource_overrides JSONB NOT NULL DEFAULT '{}'::jsonb
    `)

    // Consolidate legacy sandbox columns into datasource_overrides.sandbox.
    await queryRunner.query(`
      UPDATE mali_user_settings
      SET datasource_overrides = jsonb_set(
        datasource_overrides,
        '{sandbox}',
        jsonb_strip_nulls(
          jsonb_build_object(
            'daytonaApiKey', daytona_api_key,
            'githubRepoUrl', github_repo_url,
            'githubPat',     github_pat
          )
        ),
        true
      )
      WHERE daytona_api_key IS NOT NULL
         OR github_repo_url IS NOT NULL
         OR github_pat IS NOT NULL
    `)

    await queryRunner.query(`ALTER TABLE mali_user_settings DROP COLUMN daytona_api_key`)
    await queryRunner.query(`ALTER TABLE mali_user_settings DROP COLUMN github_repo_url`)
    await queryRunner.query(`ALTER TABLE mali_user_settings DROP COLUMN github_pat`)
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE mali_user_settings ADD COLUMN daytona_api_key VARCHAR NULL`)
    await queryRunner.query(`ALTER TABLE mali_user_settings ADD COLUMN github_repo_url VARCHAR NULL`)
    await queryRunner.query(`ALTER TABLE mali_user_settings ADD COLUMN github_pat VARCHAR NULL`)

    // Rehydrate legacy columns from datasource_overrides.sandbox. Secrets may be
    // ciphertext ("enc:v1:…") at this point — they'll round-trip as such, and
    // would need the master secret to decrypt. A rollback after encrypted
    // secrets landed is lossy for reading via the legacy path; app code is
    // expected to be rolled back in lockstep.
    await queryRunner.query(`
      UPDATE mali_user_settings
      SET
        daytona_api_key = datasource_overrides->'sandbox'->>'daytonaApiKey',
        github_repo_url = datasource_overrides->'sandbox'->>'githubRepoUrl',
        github_pat      = datasource_overrides->'sandbox'->>'githubPat'
      WHERE datasource_overrides ? 'sandbox'
    `)

    await queryRunner.query(`ALTER TABLE mali_user_settings DROP COLUMN datasource_overrides`)
  }
}
