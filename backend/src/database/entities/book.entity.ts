import {
  Entity,
  Column,
  PrimaryGeneratedColumn,
  CreateDateColumn,
  UpdateDateColumn,
  ManyToOne,
  OneToMany,
  JoinColumn,
} from 'typeorm';
import { User } from './user.entity';
import { Chapter } from './chapter.entity';
import { TranslationJob } from './translation-job.entity';

export enum BookStatus {
  DRAFT = 'draft',
  PROCESSING = 'processing',
  PARTIAL = 'partial',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('books')
export class Book {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ name: 'userId' })
  userId: string;

  @ManyToOne(() => User, (user) => user.books)
  @JoinColumn({ name: 'userId' })
  user: User;

  @Column()
  title: string;

  @Column({ nullable: true })
  originalTitle: string;

  @Column({ default: 'zh' })
  sourceLang: string;

  @Column({ default: 'vi' })
  targetLang: string;

  @Column({ type: 'enum', enum: BookStatus, default: BookStatus.DRAFT })
  status: BookStatus;

  @Column({ nullable: true })
  coverUrl: string;

  @Column({ nullable: true })
  deletedAt: Date;

  @CreateDateColumn()
  createdAt: Date;

  @UpdateDateColumn()
  updatedAt: Date;

  @OneToMany(() => Chapter, (chapter) => chapter.book)
  chapters: Chapter[];

  @OneToMany(() => TranslationJob, (job) => job.book)
  translationJobs: TranslationJob[];
}
