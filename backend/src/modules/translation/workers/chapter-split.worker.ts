import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Inject, Logger } from '@nestjs/common';
import {
  Chapter,
  ChapterStatus,
} from '../../../database/entities/chapter.entity';
import { Segment } from '../../../database/entities/segment.entity';
import type { IChunker } from '../interfaces/chunker.interface';
import { CHUNKER } from '../interfaces/chunker.interface';
import {
  QUEUE_CHAPTER_SPLIT,
  QUEUE_TRANSLATION,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
  SPLIT_WORKER_CONCURRENCY,
} from '../../../queue/queue.constants';
import {
  TranslationJob,
  JobStatus,
} from '../../../database/entities/translation-job.entity';

export interface ChapterSplitJobPayload {
  chapterId: string;
  bookJobId?: string;
  chapterJobId?: string;
}

@Processor(QUEUE_CHAPTER_SPLIT, {
  concurrency: SPLIT_WORKER_CONCURRENCY,
  stalledInterval: 300000,
  lockDuration: 300000,
  drainDelay: 300,
})
export class ChapterSplitWorker extends WorkerHost {
  private readonly logger = new Logger(ChapterSplitWorker.name);

  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @Inject(CHUNKER)
    private readonly chunker: { chunk: IChunker['chunk'] },
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
  ) {
    super();
  }

  async process(job: Job<ChapterSplitJobPayload>): Promise<void> {
    const { chapterId, bookJobId, chapterJobId } = job.data;

    const chapter = await this.chapterRepo.findOne({
      where: { id: chapterId },
    });
    if (!chapter) {
      this.logger.warn(`Chapter ${chapterId} not found, skipping`);
      return;
    }

    await this.chapterRepo.update(chapterId, {
      status: ChapterStatus.SPLITTING,
      totalSegments: 0,
      completedSegments: 0,
      translatedContent: undefined,
    });
    await this.segmentRepo.delete({ chapterId });
    if (chapterJobId) {
      await this.jobRepo.update(chapterJobId, {
        status: JobStatus.RUNNING,
        progressPercent: 0,
      });
    }

    const rawSegments = this.chunker.chunk(chapter.rawContent);

    await this.chapterRepo.update(chapterId, {
      totalSegments: rawSegments.length,
      status: ChapterStatus.TRANSLATING,
    });

    const segmentEntities = rawSegments.map((text, index) =>
      this.segmentRepo.create({
        chapterId,
        segmentIndex: index,
        sourceText: text,
      }),
    );

    const savedSegments = await this.segmentRepo.save(segmentEntities);

    await this.translationQueue.add(
      'translate-chapter',
      {
        chapterId,
        bookJobId,
        chapterJobId,
      },
      {
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: BULLMQ_BACKOFF_CONFIG,
      },
    );

    this.logger.log(
      `Chapter ${chapterId} split into ${rawSegments.length} segments`,
    );
  }
}
