import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NovelCacheService } from '../../cache/novel-cache.service';
import { Segment, SegmentStatus } from '../../database/entities/segment.entity';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import {
  QUEUE_TRANSLATION,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
} from '../../queue/queue.constants';

@Injectable()
export class SegmentService {
  constructor(
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
    private readonly novelCacheService: NovelCacheService,
  ) {}

  async retrySegment(id: string, userId: string): Promise<{ queued: boolean }> {
    const segment = await this.segmentRepo.findOne({
      where: { id },
      relations: { chapter: { book: true } },
    });

    if (!segment || segment.chapter.book.userId !== userId) {
      throw new NotFoundException('Segment not found');
    }

    await this.segmentRepo.update(id, {
      status: SegmentStatus.PENDING,
      retryCount: 0,
      errorMessage: undefined,
    });
    await this.chapterRepo
      .createQueryBuilder()
      .update(Chapter)
      .set({
        status: ChapterStatus.TRANSLATING,
        mergedContent: null,
        mergedAt: null,
        segmentsHash: null,
        mergedMetadata: null,
        mergeVersion: () => '"mergeVersion" + 1',
        completedSegments: () => 'GREATEST("completedSegments" - 1, 0)',
      })
      .where('id = :id', { id: segment.chapterId })
      .execute();
    await this.novelCacheService.invalidateBookAndChapterCaches(
      segment.chapter.bookId,
      segment.chapterId,
    );

    await this.translationQueue.add(
      'translate-chapter',
      { chapterId: segment.chapterId },
      { attempts: MAX_RETRY_ATTEMPTS, backoff: BULLMQ_BACKOFF_CONFIG },
    );

    return { queued: true };
  }
}
