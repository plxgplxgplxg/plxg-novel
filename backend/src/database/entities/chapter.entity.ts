import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
  Index,
  Unique,
} from 'typeorm';
import { Book } from './book.entity';
import { Segment } from './segment.entity';

export enum ChapterStatus {
  PENDING = 'pending',
  SPLITTING = 'splitting',
  TRANSLATING = 'translating',
  DONE = 'done',
  FAILED = 'failed',
}

@Entity('chapters')
@Unique(['bookId', 'chapterNumber'])
export class Chapter {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index('IDX_chapters_book_id')
  @Column({ name: 'book_id' })
  bookId: string;

  @ManyToOne(() => Book, (book) => book.chapters)
  @JoinColumn({ name: 'book_id' })
  book: Book;

  @Column()
  chapterNumber: number;

  @Column()
  titleOriginal: string;

  @Column({ nullable: true })
  titleTranslated: string;

  @Column({ type: 'text' })
  rawContent: string;

  @Column({ type: 'text', nullable: true })
  translatedContent: string;

  @Column({ type: 'text', nullable: true })
  mergedContent: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  mergedAt: Date | null;

  @Column({ default: 1 })
  mergeVersion: number;

  @Column({ type: 'varchar', nullable: true })
  segmentsHash: string | null;

  @Column({ type: 'jsonb', nullable: true })
  mergedMetadata:
    | {
        failedSegmentCount: number;
        readableSegmentCount: number;
        failedSegments: Array<{
          segmentIndex: number;
          sourceText: string;
          errorMessage: string | null;
        }>;
      }
    | null;

  @Column({ nullable: true })
  sourceFileName: string;

  @Column({ nullable: true })
  sourceFileSize: number;

  @Column({ type: 'enum', enum: ChapterStatus, default: ChapterStatus.PENDING })
  status: ChapterStatus;

  @Column({ default: 0 })
  totalSegments: number;

  @Column({ default: 0 })
  completedSegments: number;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Segment, (segment) => segment.chapter)
  segments: Segment[];
}
