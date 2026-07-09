import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Index,
} from 'typeorm';
import { Book } from './book.entity';
import { Chapter } from './chapter.entity';

export enum JobType {
  SPLIT_CHAPTER = 'split_chapter',
  TRANSLATE_CHAPTER = 'translate_chapter',
  TRANSLATE_BOOK = 'translate_book',
}

export enum JobStatus {
  QUEUED = 'queued',
  RUNNING = 'running',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('translation_jobs')
export class TranslationJob {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_translation_jobs_book_id')
  @Column({ name: 'book_id' })
  bookId: string;

  @ManyToOne(() => Book, (book) => book.translationJobs)
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @Index('IDX_translation_jobs_chapter_id')
  @Column({ name: 'chapter_id', nullable: true })
  chapterId: string;

  @ManyToOne(() => Chapter, { nullable: true })
  @JoinColumn({ name: 'chapter_id' })
  chapter: Chapter;

  @Column({ type: 'enum', enum: JobType })
  jobType: JobType;

  @Column({ type: 'enum', enum: JobStatus, default: JobStatus.QUEUED })
  status: JobStatus;

  @Column({ default: 0 })
  progressPercent: number;

  @Column({ nullable: true })
  bullmqJobId: string;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
