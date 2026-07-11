import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChapterChunksAndRevision1762600000000
  implements MigrationInterface
{
  name = 'AddChapterChunksAndRevision1762600000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chapters"
      ADD COLUMN IF NOT EXISTS "translationRevision" integer NOT NULL DEFAULT 1
    `);

    await queryRunner.query(`
      ALTER TABLE "translation_jobs"
      ADD COLUMN IF NOT EXISTS "translation_revision" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "error_code" character varying
    `);

    await queryRunner.query(`
      DO $$
      BEGIN
        IF NOT EXISTS (
          SELECT 1
          FROM pg_type
          WHERE typname = 'chapter_chunks_status_enum'
        ) THEN
          CREATE TYPE "chapter_chunks_status_enum" AS ENUM (
            'pending',
            'translating',
            'done',
            'failed',
            'stale'
          );
        END IF;
      END $$;
    `);

    await queryRunner.query(`
      CREATE TABLE IF NOT EXISTS "chapter_chunks" (
        "id" uuid NOT NULL DEFAULT uuid_generate_v4(),
        "chapter_id" character varying NOT NULL,
        "translation_revision" integer NOT NULL DEFAULT 1,
        "chunk_index" integer NOT NULL,
        "source_hash" character varying(64) NOT NULL,
        "source_text" text NOT NULL,
        "context_before" text,
        "paragraph_ids" jsonb NOT NULL,
        "translated_text" text,
        "structured_output" jsonb,
        "status" "chapter_chunks_status_enum" NOT NULL DEFAULT 'pending',
        "attempt_count" integer NOT NULL DEFAULT 0,
        "error_code" character varying,
        "error_message" text,
        "profile_version" integer NOT NULL DEFAULT 1,
        "glossary_version" integer NOT NULL DEFAULT 1,
        "provider_model" character varying,
        "input_tokens" integer NOT NULL DEFAULT 0,
        "output_tokens" integer NOT NULL DEFAULT 0,
        "started_at" TIMESTAMPTZ,
        "finished_at" TIMESTAMPTZ,
        "createdAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        "updatedAt" TIMESTAMPTZ NOT NULL DEFAULT now(),
        CONSTRAINT "PK_chapter_chunks_id" PRIMARY KEY ("id"),
        CONSTRAINT "UQ_chapter_chunks_revision_index" UNIQUE ("chapter_id", "translation_revision", "chunk_index"),
        CONSTRAINT "FK_chapter_chunks_chapter_id" FOREIGN KEY ("chapter_id") REFERENCES "chapters"("id") ON DELETE CASCADE
      )
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chapter_chunks_chapter_id"
      ON "chapter_chunks" ("chapter_id")
    `);

    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chapter_chunks_revision_status"
      ON "chapter_chunks" ("status", "started_at")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_chapter_chunks_revision_status"
    `);
    await queryRunner.query(`
      DROP INDEX IF EXISTS "IDX_chapter_chunks_chapter_id"
    `);
    await queryRunner.query(`
      DROP TABLE IF EXISTS "chapter_chunks"
    `);
    await queryRunner.query(`
      ALTER TABLE "translation_jobs"
      DROP COLUMN IF EXISTS "error_code",
      DROP COLUMN IF EXISTS "translation_revision"
    `);
    await queryRunner.query(`
      ALTER TABLE "chapters"
      DROP COLUMN IF EXISTS "translationRevision"
    `);
    await queryRunner.query(`
      DROP TYPE IF EXISTS "chapter_chunks_status_enum"
    `);
  }
}
