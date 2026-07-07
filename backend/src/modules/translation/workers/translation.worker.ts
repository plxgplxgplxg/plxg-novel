import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { Inject, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import {
  Chapter,
  ChapterStatus,
} from '../../../database/entities/chapter.entity';
import {
  Segment,
  SegmentStatus,
} from '../../../database/entities/segment.entity';
import { Book, BookStatus } from '../../../database/entities/book.entity';
import {
  TranslationJob,
  JobStatus,
} from '../../../database/entities/translation-job.entity';
import type { ITranslationProvider } from '../interfaces/translation-provider.interface';
import { TRANSLATION_PROVIDER } from '../interfaces/translation-provider.interface';
import {
  EmptyTranslationError,
  ProviderColdStartError,
  TranslationProviderError,
} from '../interfaces/translation-errors';
import {
  QUEUE_TRANSLATION,
  TRANSLATION_WORKER_CONCURRENCY,
  MAX_FAILED_SEGMENT_PERCENT,
} from '../../../queue/queue.constants';

export interface TranslationJobPayload {
  segmentId: string;
  chapterId: string;
  bookJobId?: string;
  chapterJobId?: string;
}

const PARAGRAPH_MARKER = '\n';

@Processor(QUEUE_TRANSLATION, { concurrency: TRANSLATION_WORKER_CONCURRENCY })
export class TranslationWorker extends WorkerHost {
  private readonly logger = new Logger(TranslationWorker.name);

  constructor(
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @Inject(TRANSLATION_PROVIDER)
    private readonly translationProvider: {
      translate: ITranslationProvider['translate'];
    },
    private readonly dataSource: DataSource,
    private readonly eventEmitter: EventEmitter2,
  ) {
    super();
  }

  async process(job: Job<TranslationJobPayload>): Promise<void> {
    const { segmentId, chapterId, bookJobId, chapterJobId } = job.data;

    const segment = await this.segmentRepo.findOne({
      where: { id: segmentId },
    });
    if (!segment) return;

    if (segment.sourceText === PARAGRAPH_MARKER) {
      await this.segmentRepo.update(segmentId, {
        translatedText: PARAGRAPH_MARKER,
        status: SegmentStatus.DONE,
      });
      await this.onSegmentCompleted(chapterId, chapterJobId, bookJobId);
      return;
    }

    await this.segmentRepo.update(segmentId, {
      status: SegmentStatus.TRANSLATING,
    });

    try {
      const translated = await this.translationProvider.translate(
        segment.sourceText,
        'zh',
        'vi',
      );

      await this.segmentRepo.update(segmentId, {
        translatedText: translated,
        status: SegmentStatus.DONE,
      });
    } catch (err) {
      await this.handleTranslationError(segmentId, segment, err);
    }

    await this.onSegmentCompleted(chapterId, chapterJobId, bookJobId);
  }

  private async handleTranslationError(
    segmentId: string,
    segment: Segment,
    err: unknown,
  ): Promise<void> {
    const isColdStart = err instanceof ProviderColdStartError;
    const message =
      err instanceof TranslationProviderError ? err.message : String(err);

    if (isColdStart) {
      this.logger.warn(`Cold start for segment ${segmentId}, will retry`);
      throw err;
    }

    const newRetryCount = segment.retryCount + 1;
    await this.segmentRepo.update(segmentId, {
      retryCount: newRetryCount,
      errorMessage: message,
      status: SegmentStatus.FAILED,
    });
  }

  private async onSegmentCompleted(
    chapterId: string,
    chapterJobId?: string,
    bookJobId?: string,
  ): Promise<void> {
    await this.dataSource.transaction(async (manager) => {
      await manager.increment(
        Chapter,
        { id: chapterId },
        'completedSegments',
        1,
      );
    });

    const chapter = await this.chapterRepo.findOne({
      where: { id: chapterId },
    });
    if (!chapter) return;

    const allProcessed = chapter.completedSegments >= chapter.totalSegments;
    if (!allProcessed) {
      await this.updateChapterJobProgress(chapter, chapterJobId);
      await this.updateBookJobProgress(chapter.bookId, bookJobId);
      this.eventEmitter.emit('chapter.progress', {
        bookId: chapter.bookId,
        chapterId,
        completed: chapter.completedSegments,
        total: chapter.totalSegments,
        percent: Math.floor(
          (chapter.completedSegments / chapter.totalSegments) * 100,
        ),
      });
      return;
    }

    await this.finalizeChapter(chapter, chapterJobId, bookJobId);
  }

  private async finalizeChapter(
    chapter: Chapter,
    chapterJobId?: string,
    bookJobId?: string,
  ): Promise<void> {
    const segments = await this.segmentRepo.find({
      where: { chapterId: chapter.id },
      order: { segmentIndex: 'ASC' },
    });

    const failedCount = segments.filter(
      (s) => s.status === SegmentStatus.FAILED,
    ).length;
    const failedPercent = failedCount / segments.length;

    const translatedContent = segments
      .map((s) =>
        s.sourceText === PARAGRAPH_MARKER ? '\n\n' : (s.translatedText ?? ''),
      )
      .join('');

    const newStatus =
      failedPercent > MAX_FAILED_SEGMENT_PERCENT
        ? ChapterStatus.FAILED
        : ChapterStatus.DONE;

    if (segments.length !== chapter.totalSegments) {
      this.logger.error(
        `Chapter ${chapter.id} has ${segments.length} segments but expected ${chapter.totalSegments}`,
      );
      await this.chapterRepo.update(chapter.id, {
        status: ChapterStatus.FAILED,
      });
      return;
    }

    await this.chapterRepo.update(chapter.id, {
      translatedContent,
      status: newStatus,
    });
    if (chapterJobId) {
      await this.jobRepo.update(chapterJobId, {
        status:
          newStatus === ChapterStatus.DONE
            ? JobStatus.COMPLETED
            : JobStatus.FAILED,
        progressPercent: 100,
        errorMessage:
          newStatus === ChapterStatus.FAILED
            ? `${failedCount} segment(s) failed`
            : undefined,
      });
    }

    await this.updateBookStatus(chapter.bookId, bookJobId);
    await this.updateBookJobProgress(chapter.bookId, bookJobId);

    this.eventEmitter.emit('chapter.progress', {
      bookId: chapter.bookId,
      chapterId: chapter.id,
      completed: chapter.totalSegments,
      total: chapter.totalSegments,
      percent: 100,
      status: newStatus,
    });
  }

  private async updateBookStatus(
    bookId: string,
    bookJobId?: string,
  ): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id: bookId } });
    if (!book) return;

    const chapters = await this.chapterRepo.find({ where: { bookId } });
    const allDone = chapters.every((c) => c.status === ChapterStatus.DONE);
    const allFailed = chapters.every((c) => c.status === ChapterStatus.FAILED);
    const anyDone = chapters.some((c) => c.status === ChapterStatus.DONE);

    let newStatus: BookStatus;
    if (allDone) newStatus = BookStatus.COMPLETED;
    else if (allFailed) newStatus = BookStatus.FAILED;
    else if (anyDone) newStatus = BookStatus.PARTIAL;
    else newStatus = BookStatus.PROCESSING;

    await this.bookRepo.update(bookId, { status: newStatus });
    if (!bookJobId) return;

    const hasActiveChapters = chapters.some((chapter) =>
      [ChapterStatus.PENDING, ChapterStatus.SPLITTING, ChapterStatus.TRANSLATING].includes(
        chapter.status,
      ),
    );

    if (hasActiveChapters) {
      await this.jobRepo.update(bookJobId, {
        status: JobStatus.RUNNING,
      });
      return;
    }

    await this.jobRepo.update(bookJobId, {
      status:
        newStatus === BookStatus.COMPLETED
          ? JobStatus.COMPLETED
          : newStatus === BookStatus.FAILED
            ? JobStatus.FAILED
            : JobStatus.COMPLETED,
      progressPercent: 100,
      errorMessage:
        newStatus === BookStatus.FAILED
          ? 'All chapters failed to translate'
          : undefined,
    });
  }

  private async updateChapterJobProgress(
    chapter: Chapter,
    chapterJobId?: string,
  ): Promise<void> {
    if (!chapterJobId || chapter.totalSegments === 0) return;

    await this.jobRepo.update(chapterJobId, {
      status: JobStatus.RUNNING,
      progressPercent: Math.floor(
        (chapter.completedSegments / chapter.totalSegments) * 100,
      ),
    });
  }

  private async updateBookJobProgress(
    bookId: string,
    bookJobId?: string,
  ): Promise<void> {
    if (!bookJobId) return;

    const summary = await this.chapterRepo
      .createQueryBuilder('chapter')
      .select('COALESCE(SUM(chapter.totalSegments), 0)', 'totalSegments')
      .addSelect(
        'COALESCE(SUM(chapter.completedSegments), 0)',
        'completedSegments',
      )
      .where('chapter.bookId = :bookId', { bookId })
      .getRawOne<{ totalSegments: string; completedSegments: string }>();

    const totalSegments = Number(summary?.totalSegments ?? 0);
    const completedSegments = Number(summary?.completedSegments ?? 0);
    const progressPercent =
      totalSegments === 0
        ? 0
        : Math.floor((completedSegments / totalSegments) * 100);

    await this.jobRepo.update(bookJobId, {
      progressPercent,
    });
  }
}
