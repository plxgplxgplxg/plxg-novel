import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { Logger } from '@nestjs/common';
import { Repository } from 'typeorm';
import { NovelCacheService } from '../../../cache/novel-cache.service';
import { Chapter } from '../../../database/entities/chapter.entity';
import { Segment } from '../../../database/entities/segment.entity';
import {
  buildRawChapterContent,
  type SegmentLike,
} from '../../chapter/chapter-readability';
import {
  MERGE_WORKER_CONCURRENCY,
  QUEUE_CHAPTER_RAW_CACHE,
} from '../../../queue/queue.constants';

export interface ChapterRawCacheJobPayload {
  chapterId: string;
}

@Processor(QUEUE_CHAPTER_RAW_CACHE, {
  concurrency: MERGE_WORKER_CONCURRENCY,
  stalledInterval: 300000,
  lockDuration: 300000,
  drainDelay: 300,
})
export class ChapterRawCacheWorker extends WorkerHost {
  private readonly logger = new Logger(ChapterRawCacheWorker.name);

  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    private readonly novelCacheService: NovelCacheService,
  ) {
    super();
  }

  async process(job: Job<ChapterRawCacheJobPayload>): Promise<void> {
    const { chapterId } = job.data;
    const chapter = await this.chapterRepo.findOne({
      where: { id: chapterId },
      select: {
        id: true,
        bookId: true,
        rawContent: true,
      },
    });

    if (!chapter) {
      this.logger.warn(`Chapter ${chapterId} not found, skipping raw cache`);
      return;
    }

    if (chapter.rawContent?.trim()) {
      return;
    }

    const segments = await this.segmentRepo.find({
      where: { chapterId },
      order: { segmentIndex: 'ASC' },
    });
    const rawContent = buildRawChapterContent(segments as SegmentLike[]);

    if (!rawContent?.trim()) {
      this.logger.warn(
        `Chapter ${chapterId} has no segments to rebuild raw content`,
      );
      return;
    }

    await this.chapterRepo.update(chapterId, { rawContent });
    await this.novelCacheService.invalidateBookAndChapterCaches(
      chapter.bookId,
      chapterId,
    );
  }
}
