import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { NovelCacheService } from '../../cache/novel-cache.service';
import { Segment, SegmentStatus } from '../../database/entities/segment.entity';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import { ChapterChunk } from '../../database/entities/chapter-chunk.entity';
import {
  TranslationJob,
  JobStatus,
  JobType,
} from '../../database/entities/translation-job.entity';
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
    @InjectRepository(ChapterChunk)
    private readonly chunkRepo: Repository<ChapterChunk>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
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
    await this.chunkRepo.delete({ chapterId: segment.chapterId });
    await this.jobRepo.delete({ chapterId: segment.chapterId });
    await this.chapterRepo
      .createQueryBuilder()
      .update(Chapter)
      .set({
        status: ChapterStatus.PENDING,
        mergedContent: null,
        mergedAt: null,
        segmentsHash: null,
        mergedMetadata: null,
        mergeVersion: () => '"mergeVersion" + 1',
        translationRevision: () => '"translationRevision" + 1',
        totalSegments: 0,
        completedSegments: 0,
        translatedContent: '',
      })
      .where('id = :id', { id: segment.chapterId })
      .execute();
    await this.novelCacheService.invalidateBookAndChapterCaches(
      segment.chapter.bookId,
      segment.chapterId,
    );

    const refreshedChapter = await this.chapterRepo.findOne({
      where: { id: segment.chapterId },
    });

    if (!refreshedChapter) {
      throw new NotFoundException('Chapter not found');
    }

    const bookJob = await this.jobRepo.save(
      this.jobRepo.create({
        bookId: segment.chapter.bookId,
        jobType: JobType.TRANSLATE_BOOK,
        status: JobStatus.QUEUED,
        translationRevision: refreshedChapter.translationRevision,
      }),
    );
    const chapterJob = await this.jobRepo.save(
      this.jobRepo.create({
        bookId: segment.chapter.bookId,
        chapterId: refreshedChapter.id,
        jobType: JobType.TRANSLATE_CHAPTER,
        status: JobStatus.QUEUED,
        translationRevision: refreshedChapter.translationRevision,
      }),
    );
    const bullmqJobId = `translate-chapter:${refreshedChapter.id}:${refreshedChapter.translationRevision}`;

    await this.translationQueue.add(
      'translate-chapter',
      {
        chapterId: refreshedChapter.id,
        bookJobId: bookJob.id,
        chapterJobId: chapterJob.id,
        translationRevision: refreshedChapter.translationRevision,
        enqueueFollowingChapters: false,
      },
      {
        jobId: bullmqJobId,
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: BULLMQ_BACKOFF_CONFIG,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );
    await this.jobRepo.update(chapterJob.id, {
      bullmqJobId,
    });

    return { queued: true };
  }
}
