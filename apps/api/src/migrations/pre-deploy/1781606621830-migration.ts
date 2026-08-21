import { MigrationInterface, QueryRunner } from 'typeorm'

export class Migration1781606621830 implements MigrationInterface {
  name = 'Migration1781606621830'

  public async up(queryRunner: QueryRunner): Promise<void> {
    // create the secret table
    await queryRunner.query(
      `CREATE TABLE "secret" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "name" character varying NOT NULL,
        "encryptedValue" text NOT NULL,
        "description" character varying,
        "hosts" text[] NOT NULL DEFAULT '{}',
        "placeholder" character varying NOT NULL,
        "organizationId" uuid NOT NULL,
        "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
        CONSTRAINT "PK_secret_id" PRIMARY KEY ("id")
      )`,
    )
    await queryRunner.query(
      `CREATE UNIQUE INDEX "IDX_secret_organizationId_name" ON "secret" ("organizationId", "name")`,
    )
    await queryRunner.query(
      `ALTER TABLE "secret" ADD CONSTRAINT "secret_organizationId_fk" FOREIGN KEY ("organizationId") REFERENCES "organization"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )

    // create the sandbox_secrets join table
    await queryRunner.query(
      `CREATE TABLE "sandbox_secrets" (
        "sandboxId" character varying NOT NULL,
        "envVar" character varying NOT NULL,
        "secretId" uuid NOT NULL,
        CONSTRAINT "PK_sandbox_secrets" PRIMARY KEY ("sandboxId", "envVar")
      )`,
    )
    await queryRunner.query(`CREATE INDEX "IDX_sandbox_secrets_sandboxId" ON "sandbox_secrets" ("sandboxId")`)
    await queryRunner.query(`CREATE INDEX "IDX_sandbox_secrets_secretId" ON "sandbox_secrets" ("secretId")`)
    await queryRunner.query(
      `ALTER TABLE "sandbox_secrets" ADD CONSTRAINT "FK_sandbox_secrets_sandboxId" FOREIGN KEY ("sandboxId") REFERENCES "sandbox"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )
    await queryRunner.query(
      `ALTER TABLE "sandbox_secrets" ADD CONSTRAINT "FK_sandbox_secrets_secretId" FOREIGN KEY ("secretId") REFERENCES "secret"("id") ON DELETE CASCADE ON UPDATE NO ACTION`,
    )

    // Runner-only token used solely to resolve plaintext secrets from the API.
    // Added nullable with NO backfill: on a table with millions of rows a backfill
    // + SET NOT NULL would rewrite/lock it. Existing sandboxes simply have a null
    // token; one is generated lazily the next time they're started (see the null
    // check in the sandbox start paths). New sandboxes get one at creation. ADD
    // COLUMN of a nullable column with no default is a fast metadata-only change.
    await queryRunner.query(`ALTER TABLE "sandbox" ADD COLUMN "secretsToken" character varying`)
    // Partial index: only non-null tokens are ever looked up, and excluding nulls
    // keeps the index empty on creation (instant build, no rewrite) and small. The
    // `secretsToken = $1` lookup still uses it (the predicate implies NOT NULL).
    await queryRunner.query(
      `CREATE INDEX "idx_sandbox_secretstoken" ON "sandbox" ("secretsToken") WHERE "secretsToken" IS NOT NULL`,
    )
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    // drop the sandbox secrets token
    await queryRunner.query(`DROP INDEX "public"."idx_sandbox_secretstoken"`)
    await queryRunner.query(`ALTER TABLE "sandbox" DROP COLUMN "secretsToken"`)

    // drop the sandbox_secrets join table
    await queryRunner.query(`ALTER TABLE "sandbox_secrets" DROP CONSTRAINT "FK_sandbox_secrets_secretId"`)
    await queryRunner.query(`ALTER TABLE "sandbox_secrets" DROP CONSTRAINT "FK_sandbox_secrets_sandboxId"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_sandbox_secrets_secretId"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_sandbox_secrets_sandboxId"`)
    await queryRunner.query(`DROP TABLE "sandbox_secrets"`)

    // drop the secret table
    await queryRunner.query(`ALTER TABLE "secret" DROP CONSTRAINT "secret_organizationId_fk"`)
    await queryRunner.query(`DROP INDEX "public"."IDX_secret_organizationId_name"`)
    await queryRunner.query(`DROP TABLE "secret"`)
  }
}
