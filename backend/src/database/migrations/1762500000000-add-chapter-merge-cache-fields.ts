import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddChapterMergeCacheFields1762500000000
  implements MigrationInterface
{
  name = 'AddChapterMergeCacheFields1762500000000';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE "chapters"
      ADD COLUMN IF NOT EXISTS "mergedContent" text,
      ADD COLUMN IF NOT EXISTS "mergedAt" TIMESTAMPTZ,
      ADD COLUMN IF NOT EXISTS "mergeVersion" integer NOT NULL DEFAULT 1,
      ADD COLUMN IF NOT EXISTS "segmentsHash" character varying,
      ADD COLUMN IF NOT EXISTS "mergedMetadata" jsonb
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_books_user_id"
      ON "books" ("user_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_chapters_book_id"
      ON "chapters" ("book_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_segments_chapter_id"
      ON "segments" ("chapter_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_translation_jobs_book_id"
      ON "translation_jobs" ("book_id")
    `);
    await queryRunner.query(`
      CREATE INDEX IF NOT EXISTS "IDX_translation_jobs_chapter_id"
      ON "translation_jobs" ("chapter_id")
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_translation_jobs_chapter_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_translation_jobs_book_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_segments_chapter_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_chapters_book_id"`);
    await queryRunner.query(`DROP INDEX IF EXISTS "IDX_books_user_id"`);
    await queryRunner.query(`
      ALTER TABLE "chapters"
      DROP COLUMN IF EXISTS "mergedMetadata",
      DROP COLUMN IF EXISTS "segmentsHash",
      DROP COLUMN IF EXISTS "mergeVersion",
      DROP COLUMN IF EXISTS "mergedAt",
      DROP COLUMN IF EXISTS "mergedContent"
    `);
  }
}
