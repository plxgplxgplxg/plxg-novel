import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Logger } from '@nestjs/common';
import {
  CHAPTER_MERGE_LOCK_PREFIX,
  CHAPTER_MERGE_LOCK_TTL_MS,
} from '../../../cache/cache.constants';
import { NovelCacheService } from '../../../cache/novel-cache.service';
import { RedisCacheService } from '../../../cache/redis-cache.service';
import { Chapter } from '../../../database/entities/chapter.entity';
import { Segment } from '../../../database/entities/segment.entity';
import { buildChapterMergePayload } from '../../chapter/chapter-merge';
import {
  MERGE_WORKER_CONCURRENCY,
  QUEUE_CHAPTER_MERGE,
} from '../../../queue/queue.constants';

export interface ChapterMergeJobPayload {
  chapterId: string;
}

@Processor(QUEUE_CHAPTER_MERGE, {
  concurrency: MERGE_WORKER_CONCURRENCY,
  stalledInterval: 300000,
  lockDuration: 300000,
  drainDelay: 300,
})
export class ChapterMergeWorker extends WorkerHost {
  private readonly logger = new Logger(ChapterMergeWorker.name);

  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    private readonly dataSource: DataSource,
    private readonly redisCacheService: RedisCacheService,
    private readonly novelCacheService: NovelCacheService,
  ) {
    super();
  }

  async process(job: Job<ChapterMergeJobPayload>): Promise<void> {
    const { chapterId } = job.data;
    const lockKey = `${CHAPTER_MERGE_LOCK_PREFIX}${chapterId}`;
    const lockToken = await this.redisCacheService.acquireLock(
      lockKey,
      CHAPTER_MERGE_LOCK_TTL_MS,
    );

    if (!lockToken) {
      this.logger.debug(`Skip merge for chapter ${chapterId}: lock held`);
      return;
    }

    try {
      const chapter = await this.chapterRepo.findOne({ where: { id: chapterId } });
      if (!chapter) {
        this.logger.warn(`Chapter ${chapterId} not found, skipping merge`);
        return;
      }

      const segments = await this.segmentRepo.find({
        where: { chapterId },
        order: { segmentIndex: 'ASC' },
      });

      const merged = buildChapterMergePayload(segments);
      if (
        chapter.mergedAt &&
        chapter.segmentsHash &&
        chapter.segmentsHash === merged.segmentsHash
      ) {
        this.logger.debug(`Skip merge for chapter ${chapterId}: unchanged hash`);
        return;
      }

      const nextMergeVersion =
        chapter.segmentsHash && chapter.segmentsHash !== merged.segmentsHash
          ? chapter.mergeVersion + 1
          : chapter.mergeVersion;

      await this.dataSource.transaction(async (manager) => {
        await manager.update(Chapter, chapterId, {
          mergedContent: merged.content,
          translatedContent: merged.content,
          mergedAt: new Date(),
          mergeVersion: nextMergeVersion,
          segmentsHash: merged.segmentsHash,
          mergedMetadata: {
            failedSegmentCount: merged.failedSegmentCount,
            readableSegmentCount: merged.readableSegmentCount,
            failedSegments: merged.failedSegments,
          },
        });
      });

      await this.novelCacheService.invalidateBookAndChapterCaches(
        chapter.bookId,
        chapterId,
      );
    } finally {
      await this.redisCacheService.releaseLock(lockKey, lockToken);
    }
  }
}
