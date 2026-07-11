import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Chapter } from './chapter.entity';

export enum ChapterChunkStatus {
  PENDING = 'pending',
  TRANSLATING = 'translating',
  DONE = 'done',
  FAILED = 'failed',
  STALE = 'stale',
}

@Entity('chapter_chunks')
@Unique(['chapterId', 'translationRevision', 'chunkIndex'])
export class ChapterChunk {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_chapter_chunks_chapter_id')
  @Column({ name: 'chapter_id' })
  chapterId: string;

  @ManyToOne(() => Chapter, (chapter) => chapter.chunks, {
    onDelete: 'CASCADE',
  })
  @JoinColumn({ name: 'chapter_id' })
  chapter: Chapter;

  @Column({ default: 1, name: 'translation_revision' })
  translationRevision: number;

  @Column({ name: 'chunk_index' })
  chunkIndex: number;

  @Column({ name: 'source_hash', length: 64 })
  sourceHash: string;

  @Column({ name: 'source_text', type: 'text' })
  sourceText: string;

  @Column({ name: 'context_before', type: 'text', nullable: true })
  contextBefore: string | null;

  @Column({ name: 'paragraph_ids', type: 'jsonb' })
  paragraphIds: string[];

  @Column({ name: 'translated_text', type: 'text', nullable: true })
  translatedText: string | null;

  @Column({ name: 'structured_output', type: 'jsonb', nullable: true })
  structuredOutput:
    | {
        paragraphs: Array<{ id: string; text: string }>;
      }
    | null;

  @Index('IDX_chapter_chunks_revision_status')
  @Column({
    type: 'enum',
    enum: ChapterChunkStatus,
    default: ChapterChunkStatus.PENDING,
  })
  status: ChapterChunkStatus;

  @Column({ name: 'attempt_count', default: 0 })
  attemptCount: number;

  @Column({ name: 'error_code', type: 'varchar', nullable: true })
  errorCode: string | null;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage: string | null;

  @Column({ name: 'profile_version', default: 1 })
  profileVersion: number;

  @Column({ name: 'glossary_version', default: 1 })
  glossaryVersion: number;

  @Column({ name: 'provider_model', type: 'varchar', nullable: true })
  providerModel: string | null;

  @Column({ name: 'input_tokens', default: 0 })
  inputTokens: number;

  @Column({ name: 'output_tokens', default: 0 })
  outputTokens: number;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt: Date | null;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
