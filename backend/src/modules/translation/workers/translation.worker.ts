import { InjectQueue, Processor, WorkerHost } from '@nestjs/bullmq';
import { DelayedError, Job, Queue } from 'bullmq';
import { InjectRepository } from '@nestjs/typeorm';
import { In, Repository } from 'typeorm';
import { Inject, Logger } from '@nestjs/common';
import { EventEmitter2 } from '@nestjs/event-emitter';
import { NovelCacheService } from '../../../cache/novel-cache.service';
import {
  Chapter,
  ChapterStatus,
} from '../../../database/entities/chapter.entity';
import { Book, BookStatus } from '../../../database/entities/book.entity';
import {
  ChapterChunk,
  ChapterChunkStatus,
} from '../../../database/entities/chapter-chunk.entity';
import {
  TranslationJob,
  JobStatus,
  JobType,
} from '../../../database/entities/translation-job.entity';
import type {
  ITranslationProvider,
  TranslationChunkRequest,
  TranslationChunkResult,
} from '../interfaces/translation-provider.interface';
import { TRANSLATION_PROVIDER } from '../interfaces/translation-provider.interface';
import {
  ProviderColdStartError,
  TranslationProviderError,
} from '../interfaces/translation-errors';
import {
  BULLMQ_BACKOFF_CONFIG,
  CHAPTER_ORDER_RETRY_DELAY_MS,
  MAX_RETRY_ATTEMPTS,
  QUEUE_TRANSLATION,
  TRANSLATION_WORKER_CONCURRENCY,
} from '../../../queue/queue.constants';
import { ChapterChunkPlanner } from '../chunker/chapter-chunk-planner';
import {
  buildReadableChunkContent,
  getFailedChunkDiagnostics,
} from '../chunker/chapter-chunk-readability';
import {
  TRANSLATION_GLOSSARY_VERSION,
  TRANSLATION_PROFILE,
} from '../translation-profile';
import { TranslationConcurrencyService } from '../translation-concurrency.service';

export interface TranslationJobPayload {
  chapterId: string;
  bookJobId?: string;
  chapterJobId?: string;
  translationRevision?: number;
  enqueueFollowingChapters?: boolean;
}

@Processor(QUEUE_TRANSLATION, {
  concurrency: TRANSLATION_WORKER_CONCURRENCY,
  stalledInterval: 300000,
  lockDuration: 300000,
  drainDelay: 60,
})
export class TranslationWorker extends WorkerHost {
  private readonly logger = new Logger(TranslationWorker.name);

  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(ChapterChunk)
    private readonly chunkRepo: Repository<ChapterChunk>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @Inject(TRANSLATION_PROVIDER)
    private readonly translationProvider: ITranslationProvider,
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
    private readonly planner: ChapterChunkPlanner,
    private readonly eventEmitter: EventEmitter2,
    private readonly novelCacheService: NovelCacheService,
    private readonly concurrencyGate: TranslationConcurrencyService,
  ) {
    super();
  }

  async process(job: Job<TranslationJobPayload>): Promise<void> {
    const chapter = await this.chapterRepo.findOne({
      where: { id: job.data.chapterId },
    });

    if (!chapter) {
      this.logger.warn(`Chapter ${job.data.chapterId} not found, skipping`);
      return;
    }

    const revision =
      job.data.translationRevision ?? chapter.translationRevision;

    if (chapter.translationRevision !== revision) {
      this.logger.warn(
        `Skip stale chapter job chapterId=${chapter.id} jobRevision=${revision} currentRevision=${chapter.translationRevision}`,
      );
      await this.markChunkRevisionStale(chapter.id, revision);
      return;
    }

    await this.delayUntilPreviousChaptersComplete(job, chapter);

    await this.ensureChapterJobsRunning(
      chapter.id,
      job.data.chapterJobId,
      revision,
    );
    const chunks = await this.prepareChunks(chapter, revision);

    if (chunks.length === 0) {
      await this.failChapter(
        chapter,
        job.data.chapterJobId,
        job.data.bookJobId,
        'EMPTY_SOURCE',
        'Chapter source is empty',
      );
      return;
    }

    const unfinishedChunks = chunks.filter(
      (chunk) => chunk.status !== ChapterChunkStatus.DONE,
    );

    for (
      let index = 0;
      index < unfinishedChunks.length;
      index += TRANSLATION_WORKER_CONCURRENCY
    ) {
      const batch = unfinishedChunks.slice(
        index,
        index + TRANSLATION_WORKER_CONCURRENCY,
      );

      await Promise.all(
        batch.map((chunk) =>
          this.processChunk(chapter, chunk, job.data.chapterJobId),
        ),
      );
    }

    const refreshedChapter = await this.chapterRepo.findOne({
      where: { id: chapter.id },
    });
    if (
      !refreshedChapter ||
      refreshedChapter.translationRevision !== revision
    ) {
      return;
    }

    const finalChunks = await this.chunkRepo.find({
      where: { chapterId: chapter.id, translationRevision: revision },
      order: { chunkIndex: 'ASC' },
    });

    const hasFailedChunks = finalChunks.some(
      (chunk) => chunk.status === ChapterChunkStatus.FAILED,
    );

    if (hasFailedChunks) {
      await this.failChapter(
        refreshedChapter,
        job.data.chapterJobId,
        job.data.bookJobId,
        'CHUNK_FAILED',
        'One or more translation chunks failed',
      );
      return;
    }

    await this.completeChapter(refreshedChapter, finalChunks, job.data);
  }

  private async prepareChunks(
    chapter: Chapter,
    translationRevision: number,
  ): Promise<ChapterChunk[]> {
    const existingChunks = await this.chunkRepo.find({
      where: {
        chapterId: chapter.id,
        translationRevision,
      },
      order: { chunkIndex: 'ASC' },
    });

    if (existingChunks.length > 0) {
      await this.chapterRepo.update(chapter.id, {
        status: ChapterStatus.TRANSLATING,
        totalSegments: existingChunks.length,
        completedSegments: existingChunks.filter(
          (chunk) => chunk.status === ChapterChunkStatus.DONE,
        ).length,
      });
      return existingChunks;
    }

    const plannedChunks = this.planner.plan(chapter.rawContent);

    await this.chunkRepo.save(
      plannedChunks.map((plannedChunk) =>
        this.chunkRepo.create({
          chapterId: chapter.id,
          translationRevision,
          chunkIndex: plannedChunk.chunkIndex,
          sourceHash: plannedChunk.sourceHash,
          sourceText: plannedChunk.sourceText,
          contextBefore: plannedChunk.contextBefore,
          paragraphIds: plannedChunk.paragraphIds,
          profileVersion: TRANSLATION_PROFILE.version,
          glossaryVersion: TRANSLATION_GLOSSARY_VERSION,
        }),
      ),
    );

    await this.chapterRepo.update(chapter.id, {
      status: ChapterStatus.TRANSLATING,
      totalSegments: plannedChunks.length,
      completedSegments: 0,
      translatedContent: '',
      mergedContent: null,
      mergedAt: null,
      segmentsHash: null,
      mergedMetadata: null,
    });

    return this.chunkRepo.find({
      where: {
        chapterId: chapter.id,
        translationRevision,
      },
      order: { chunkIndex: 'ASC' },
    });
  }

  private async processChunk(
    chapter: Chapter,
    chunk: ChapterChunk,
    chapterJobId: string | undefined,
  ): Promise<void> {
    if (chunk.status === ChapterChunkStatus.DONE) {
      return;
    }

    const claimResult = await this.chunkRepo.update(
      {
        id: chunk.id,
        status: In([ChapterChunkStatus.PENDING, ChapterChunkStatus.FAILED]),
      },
      {
        status: ChapterChunkStatus.TRANSLATING,
        attemptCount: chunk.attemptCount + 1,
        errorCode: null,
        errorMessage: null,
        startedAt: new Date(),
        finishedAt: null,
      },
    );

    if (
      claimResult.affected === 0 &&
      chunk.status !== ChapterChunkStatus.TRANSLATING
    ) {
      return;
    }

    const request: TranslationChunkRequest = {
      requestId: chunk.id,
      sourceLang: 'zh',
      targetLang: 'vi',
      contextBefore: chunk.contextBefore ?? undefined,
      glossary: [],
      profile: TRANSLATION_PROFILE,
      paragraphs: chunk.paragraphIds.map((paragraphId, index) => ({
        id: paragraphId,
        text: chunk.sourceText.split('\n\n')[index] ?? '',
      })),
    };

    try {
      const result = await this.concurrencyGate.run(() =>
        this.translationProvider.translateChunk(request),
      );

      const translatedText = this.validateChunkResult(chunk, result);

      await this.chunkRepo.update(chunk.id, {
        status: ChapterChunkStatus.DONE,
        translatedText,
        structuredOutput: {
          paragraphs: result.paragraphs,
          providerAttempt: result.attempt ?? 1,
        },
        providerModel: result.model,
        inputTokens: result.inputTokens ?? 0,
        outputTokens: result.outputTokens ?? 0,
        finishedAt: new Date(),
      });
      this.logger.log(
        `Chunk translated chapterId=${chapter.id} chunkId=${chunk.id} providerAttempt=${result.attempt ?? 1}`,
      );
      await this.flushChunkProgress(
        chapter,
        chapter.translationRevision,
        chapterJobId,
      );
    } catch (error) {
      if (error instanceof ProviderColdStartError) {
        throw error;
      }

      const message =
        error instanceof TranslationProviderError
          ? error.message
          : String(error);

      await this.chunkRepo.update(chunk.id, {
        status: ChapterChunkStatus.FAILED,
        errorCode: this.classifyChunkError(message),
        errorMessage: message,
        finishedAt: new Date(),
      });
      await this.flushChunkProgress(
        chapter,
        chapter.translationRevision,
        chapterJobId,
      );
    }
  }

  private async flushChunkProgress(
    chapter: Chapter,
    revision: number,
    chapterJobId: string | undefined,
  ): Promise<void> {
    const chunks = await this.chunkRepo.find({
      where: { chapterId: chapter.id, translationRevision: revision },
      order: { chunkIndex: 'ASC' },
    });
    const progress = this.buildChunkProgress(chunks);
    if (progress.totalChunks === 0) {
      return;
    }

    const failedChunks = getFailedChunkDiagnostics(chunks);
    const { content: readableContent, readableChunkCount } =
      buildReadableChunkContent(chunks);
    const percent = Math.floor(
      (progress.completedChunks / progress.totalChunks) * 100,
    );

    await this.chapterRepo
      .createQueryBuilder()
      .update(Chapter)
      .set({
        totalSegments: progress.totalChunks,
        completedSegments: () =>
          `GREATEST("completedSegments", ${progress.completedChunks})`,
        translatedContent: readableContent ?? '',
        mergedMetadata: {
          failedSegmentCount: failedChunks.length,
          readableSegmentCount: readableChunkCount,
          failedSegments: failedChunks,
        },
      })
      .where('id = :chapterId', { chapterId: chapter.id })
      .andWhere('"translationRevision" = :revision', { revision })
      .execute();

    if (chapterJobId) {
      await this.jobRepo
        .createQueryBuilder()
        .update(TranslationJob)
        .set({
          status: JobStatus.RUNNING,
          progressPercent: () => `GREATEST("progressPercent", ${percent})`,
          translationRevision: revision,
        })
        .where('id = :chapterJobId', { chapterJobId })
        .execute();
    }

    await this.novelCacheService.invalidateBookAndChapterCaches(
      chapter.bookId,
      chapter.id,
    );

    this.logger.log(
      `Chunk progress flushed chapterId=${chapter.id} revision=${revision} completed=${progress.completedChunks}/${progress.totalChunks} failed=${progress.failedChunks}`,
    );

    this.eventEmitter.emit('chapter.progress', {
      bookId: chapter.bookId,
      chapterId: chapter.id,
      revision,
      stage: 'translating',
      completedChunks: progress.completedChunks,
      totalChunks: progress.totalChunks,
      failedChunks: progress.failedChunks,
      completed: progress.completedChunks,
      total: progress.totalChunks,
      percent,
      status: ChapterStatus.TRANSLATING,
    });
  }

  private buildChunkProgress(chunks: ChapterChunk[]): {
    completedChunks: number;
    failedChunks: number;
    totalChunks: number;
  } {
    return {
      completedChunks: chunks.filter(
        (chunk) => chunk.status === ChapterChunkStatus.DONE,
      ).length,
      failedChunks: chunks.filter(
        (chunk) => chunk.status === ChapterChunkStatus.FAILED,
      ).length,
      totalChunks: chunks.length,
    };
  }

  private validateChunkResult(
    chunk: ChapterChunk,
    result: TranslationChunkResult,
  ): string {
    const expectedParagraphIds = chunk.paragraphIds;
    const actualParagraphIds = result.paragraphs.map(
      (paragraph) => paragraph.id,
    );

    if (expectedParagraphIds.length !== actualParagraphIds.length) {
      throw new TranslationProviderError('INVALID_PARAGRAPH_COUNT');
    }

    if (expectedParagraphIds.join('|') !== actualParagraphIds.join('|')) {
      throw new TranslationProviderError('INVALID_PARAGRAPH_ORDER');
    }

    const translatedText = result.paragraphs
      .map((paragraph) => paragraph.text.trim())
      .join('\n\n')
      .trim();

    if (!translatedText) {
      throw new TranslationProviderError('EMPTY_TRANSLATED_TEXT');
    }

    return translatedText;
  }

  private async completeChapter(
    chapter: Chapter,
    chunks: ChapterChunk[],
    jobData: TranslationJobPayload,
  ): Promise<void> {
    const { content: mergedContent, readableChunkCount } =
      buildReadableChunkContent(chunks);
    const failedChunks = getFailedChunkDiagnostics(chunks);

    await this.chapterRepo.update(chapter.id, {
      status: ChapterStatus.DONE,
      translatedContent: mergedContent ?? '',
      mergedContent: mergedContent ?? '',
      mergedAt: new Date(),
      totalSegments: chunks.length,
      completedSegments: chunks.length,
      mergedMetadata: {
        failedSegmentCount: failedChunks.length,
        readableSegmentCount: readableChunkCount,
        failedSegments: failedChunks,
      },
    });

    if (jobData.chapterJobId) {
      await this.jobRepo.update(jobData.chapterJobId, {
        status: JobStatus.COMPLETED,
        progressPercent: 100,
        translationRevision: chapter.translationRevision,
        errorCode: null,
        errorMessage: null,
      });
    }

    await this.novelCacheService.invalidateBookAndChapterCaches(
      chapter.bookId,
      chapter.id,
    );
    await this.emitProgress(chapter.id, chapter.translationRevision, true);
    await this.updateBookState(
      chapter.bookId,
      jobData.bookJobId,
      jobData.enqueueFollowingChapters === true,
    );
  }

  private async failChapter(
    chapter: Chapter,
    chapterJobId: string | undefined,
    bookJobId: string | undefined,
    errorCode: string,
    errorMessage: string,
  ): Promise<void> {
    const chunks = await this.chunkRepo.find({
      where: {
        chapterId: chapter.id,
        translationRevision: chapter.translationRevision,
      },
      order: { chunkIndex: 'ASC' },
    });
    const failedChunks = getFailedChunkDiagnostics(chunks);
    const { content: readableContent, readableChunkCount } =
      buildReadableChunkContent(chunks);
    const completedCount = chunks.filter(
      (chunk) => chunk.status === ChapterChunkStatus.DONE,
    ).length;

    await this.chapterRepo.update(chapter.id, {
      status: ChapterStatus.FAILED,
      translatedContent: readableContent ?? '',
      mergedContent: null,
      mergedAt: null,
      totalSegments: chunks.length,
      completedSegments: completedCount,
      mergedMetadata: {
        failedSegmentCount: failedChunks.length,
        readableSegmentCount: readableChunkCount,
        failedSegments: failedChunks,
      },
    });

    if (chapterJobId) {
      await this.jobRepo.update(chapterJobId, {
        status: JobStatus.FAILED,
        progressPercent:
          chunks.length === 0
            ? 0
            : Math.floor((completedCount / chunks.length) * 100),
        translationRevision: chapter.translationRevision,
        errorCode,
        errorMessage,
      });
    }

    await this.novelCacheService.invalidateBookAndChapterCaches(
      chapter.bookId,
      chapter.id,
    );
    await this.emitProgress(
      chapter.id,
      chapter.translationRevision,
      false,
      true,
    );
    await this.updateBookState(chapter.bookId, bookJobId, false);
  }

  private async ensureChapterJobsRunning(
    chapterId: string,
    chapterJobId: string | undefined,
    translationRevision: number,
  ): Promise<void> {
    await this.chapterRepo.update(chapterId, {
      status: ChapterStatus.TRANSLATING,
    });

    if (!chapterJobId) {
      return;
    }

    await this.jobRepo.update(chapterJobId, {
      status: JobStatus.RUNNING,
      progressPercent: 0,
      translationRevision,
    });
  }

  private async delayUntilPreviousChaptersComplete(
    job: Job<TranslationJobPayload>,
    chapter: Chapter,
  ): Promise<void> {
    const previousIncompleteChapter = await this.chapterRepo
      .createQueryBuilder('chapter')
      .select(['chapter.id', 'chapter.chapterNumber', 'chapter.status'])
      .where('chapter.bookId = :bookId', { bookId: chapter.bookId })
      .andWhere('chapter.chapterNumber < :chapterNumber', {
        chapterNumber: chapter.chapterNumber,
      })
      .andWhere('chapter.status != :doneStatus', {
        doneStatus: ChapterStatus.DONE,
      })
      .orderBy('chapter.chapterNumber', 'ASC')
      .addOrderBy('chapter.createdAt', 'ASC')
      .getOne();

    if (!previousIncompleteChapter) {
      return;
    }

    const delayUntil = Date.now() + CHAPTER_ORDER_RETRY_DELAY_MS;
    await job.moveToDelayed(delayUntil, job.token);
    this.logger.debug(
      `Delay chapter translation chapterId=${chapter.id} waitingForChapterId=${previousIncompleteChapter.id}`,
    );
    throw new DelayedError();
  }

  private async emitProgress(
    chapterId: string,
    revision: number,
    isCompleted = false,
    isFailed = false,
  ): Promise<void> {
    const chapter = await this.chapterRepo.findOne({
      where: { id: chapterId },
    });
    if (!chapter || chapter.translationRevision !== revision) {
      return;
    }

    const { completedChunks, failedChunks, totalChunks } =
      await this.getChunkProgress(chapterId, revision);
    if (totalChunks === 0) {
      return;
    }

    await this.chapterRepo.update(chapterId, {
      totalSegments: totalChunks,
      completedSegments: completedChunks,
    });

    const percent =
      totalChunks === 0 ? 0 : Math.floor((completedChunks / totalChunks) * 100);

    await this.novelCacheService.invalidateBookAndChapterCaches(
      chapter.bookId,
      chapterId,
    );

    this.eventEmitter.emit('chapter.progress', {
      bookId: chapter.bookId,
      chapterId,
      revision,
      stage: isCompleted ? 'done' : isFailed ? 'failed' : 'translating',
      completedChunks,
      totalChunks,
      failedChunks,
      completed: completedChunks,
      total: totalChunks,
      percent: isCompleted ? 100 : percent,
      status: chapter.status,
    });
  }

  private async getChunkProgress(
    chapterId: string,
    revision: number,
  ): Promise<{
    completedChunks: number;
    failedChunks: number;
    totalChunks: number;
  }> {
    const row = await this.chunkRepo
      .createQueryBuilder('chunk')
      .select('COUNT(chunk.id)::int', 'totalChunks')
      .addSelect(
        `COALESCE(SUM(CASE WHEN chunk.status = :done THEN 1 ELSE 0 END), 0)::int`,
        'completedChunks',
      )
      .addSelect(
        `COALESCE(SUM(CASE WHEN chunk.status = :failed THEN 1 ELSE 0 END), 0)::int`,
        'failedChunks',
      )
      .where('chunk.chapterId = :chapterId', { chapterId })
      .andWhere('chunk.translationRevision = :revision', { revision })
      .setParameters({
        done: ChapterChunkStatus.DONE,
        failed: ChapterChunkStatus.FAILED,
      })
      .getRawOne<{
        completedChunks: number | string;
        failedChunks: number | string;
        totalChunks: number | string;
      }>();

    return {
      completedChunks: Number(row?.completedChunks ?? 0),
      failedChunks: Number(row?.failedChunks ?? 0),
      totalChunks: Number(row?.totalChunks ?? 0),
    };
  }

  private async updateBookState(
    bookId: string,
    bookJobId: string | undefined,
    enqueueFollowingChapters: boolean,
  ): Promise<void> {
    const chapters = await this.chapterRepo.find({
      where: { bookId },
      order: { chapterNumber: 'ASC', createdAt: 'ASC' },
    });

    const allDone =
      chapters.length > 0 &&
      chapters.every((c) => c.status === ChapterStatus.DONE);
    const allFailed =
      chapters.length > 0 &&
      chapters.every((c) => c.status === ChapterStatus.FAILED);
    const anyFailed = chapters.some((c) => c.status === ChapterStatus.FAILED);
    const anyDone = chapters.some((c) => c.status === ChapterStatus.DONE);
    const anyActive = chapters.some((c) =>
      [
        ChapterStatus.PENDING,
        ChapterStatus.TRANSLATING,
        ChapterStatus.SPLITTING,
      ].includes(c.status),
    );

    let status = BookStatus.PROCESSING;
    if (allDone) {
      status = BookStatus.COMPLETED;
    } else if (allFailed) {
      status = BookStatus.FAILED;
    } else if (anyDone && anyFailed) {
      status = BookStatus.PARTIAL;
    }

    await this.bookRepo.update(bookId, { status });
    await this.novelCacheService.invalidateBookAndChapterCaches(bookId);

    if (bookJobId) {
      await this.jobRepo.update(bookJobId, {
        status: anyActive
          ? JobStatus.RUNNING
          : status === BookStatus.FAILED
            ? JobStatus.FAILED
            : JobStatus.COMPLETED,
        progressPercent: allDone || !anyActive ? 100 : 0,
      });
    }

    if (!enqueueFollowingChapters) {
      return;
    }

    const nextChapter = chapters.find(
      (candidate) =>
        candidate.status === ChapterStatus.PENDING ||
        candidate.status === ChapterStatus.FAILED,
    );

    if (!nextChapter) {
      return;
    }

    const chapterJob = await this.jobRepo.save(
      this.jobRepo.create({
        bookId,
        chapterId: nextChapter.id,
        jobType: JobType.TRANSLATE_CHAPTER,
        status: JobStatus.QUEUED,
        translationRevision: nextChapter.translationRevision,
      }),
    );

    const jobId = `translate-chapter:${nextChapter.id}:${nextChapter.translationRevision}`;
    await this.translationQueue.add(
      'translate-chapter',
      {
        chapterId: nextChapter.id,
        bookJobId,
        chapterJobId: chapterJob.id,
        translationRevision: nextChapter.translationRevision,
        enqueueFollowingChapters: true,
      },
      {
        jobId,
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: BULLMQ_BACKOFF_CONFIG,
        removeOnComplete: true,
        removeOnFail: true,
      },
    );

    await this.jobRepo.update(chapterJob.id, {
      bullmqJobId: jobId,
    });
  }

  private classifyChunkError(message: string): string {
    if (message.includes('INVALID_PARAGRAPH')) {
      return 'INVALID_OUTPUT';
    }

    if (message.includes('EMPTY_')) {
      return 'EMPTY_OUTPUT';
    }

    return 'TRANSLATION_ERROR';
  }

  private async markChunkRevisionStale(
    chapterId: string,
    translationRevision: number,
  ): Promise<void> {
    await this.chunkRepo.update(
      {
        chapterId,
        translationRevision,
        status: In([
          ChapterChunkStatus.PENDING,
          ChapterChunkStatus.TRANSLATING,
        ]),
      },
      { status: ChapterChunkStatus.STALE },
    );
  }
}
