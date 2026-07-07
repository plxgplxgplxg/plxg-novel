import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  JoinColumn,
  Unique,
} from 'typeorm';
import { Chapter } from './chapter.entity';

export enum SegmentStatus {
  PENDING = 'pending',
  TRANSLATING = 'translating',
  DONE = 'done',
  FAILED = 'failed',
}

@Entity('segments')
@Unique(['chapterId', 'segmentIndex'])
export class Segment {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'chapter_id' })
  chapterId: string;

  @ManyToOne(() => Chapter, (chapter) => chapter.segments)
  @JoinColumn({ name: 'chapter_id' })
  chapter: Chapter;

  @Column()
  segmentIndex: number;

  @Column({ length: 160 })
  sourceText: string;

  @Column({ type: 'text', nullable: true })
  translatedText: string;

  @Column({ type: 'enum', enum: SegmentStatus, default: SegmentStatus.PENDING })
  status: SegmentStatus;

  @Column({ default: 0 })
  retryCount: number;

  @Column({ nullable: true })
  errorMessage: string;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;
}
