import { DelayedError } from 'bullmq';
import { ChapterStatus } from '../../../database/entities/chapter.entity';
import { ChapterChunkStatus } from '../../../database/entities/chapter-chunk.entity';
import { JobStatus } from '../../../database/entities/translation-job.entity';
import { TranslationWorker } from './translation.worker';

function createWorker(overrides: {
  chapterRepo?: Record<string, unknown>;
  bookRepo?: Record<string, unknown>;
  chunkRepo?: Record<string, unknown>;
  jobRepo?: Record<string, unknown>;
  translationProvider?: Record<string, unknown>;
  translationQueue?: Record<string, unknown>;
  planner?: Record<string, unknown>;
  eventEmitter?: Record<string, unknown>;
  novelCacheService?: Record<string, unknown>;
  concurrencyGate?: Record<string, unknown>;
} = {}) {
  return new TranslationWorker(
    overrides.chapterRepo as never,
    (overrides.bookRepo ?? {}) as never,
    overrides.chunkRepo as never,
    overrides.jobRepo as never,
    overrides.translationProvider as never,
    (overrides.translationQueue ?? {}) as never,
    (overrides.planner ?? {}) as never,
    overrides.eventEmitter as never,
    overrides.novelCacheService as never,
    overrides.concurrencyGate as never,
  );
}

describe('TranslationWorker', () => {
  it('persists readable chunk content before emitting SSE progress', async () => {
    const calls: string[] = [];
    const chapter = {
      id: 'chapter-1',
      bookId: 'book-1',
      translationRevision: 3,
    };
    const chunk = {
      id: 'chunk-1',
      chapterId: 'chapter-1',
      translationRevision: 3,
      chunkIndex: 0,
      status: ChapterChunkStatus.PENDING,
      attemptCount: 0,
      sourceText: '第一段',
      contextBefore: null,
      paragraphIds: ['p1'],
    };
    const translatedChunk = {
      ...chunk,
      status: ChapterChunkStatus.DONE,
      translatedText: 'Doan mot',
      structuredOutput: {
        paragraphs: [{ id: 'p1', text: 'Doan mot' }],
      },
    };
    const updateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      execute: jest.fn().mockImplementation(() => {
        calls.push('chapter:update');
        return Promise.resolve();
      }),
    };
    const jobUpdateQuery = {
      update: jest.fn().mockReturnThis(),
      set: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      execute: jest.fn().mockResolvedValue(undefined),
    };
    const chapterRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(updateQuery),
    };
    const chunkRepo = {
      update: jest.fn().mockResolvedValue({ affected: 1 }),
      find: jest.fn().mockResolvedValue([translatedChunk]),
    };
    const jobRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(jobUpdateQuery),
    };
    const translationProvider = {
      translateChunk: jest.fn().mockResolvedValue({
        paragraphs: [{ id: 'p1', text: 'Doan mot' }],
        model: 'fake',
        attempt: 1,
      }),
    };
    const eventEmitter = {
      emit: jest.fn().mockImplementation(() => {
        calls.push('sse:emit');
      }),
    };
    const novelCacheService = {
      invalidateBookAndChapterCaches: jest.fn().mockResolvedValue(undefined),
    };
    const worker = createWorker({
      chapterRepo,
      chunkRepo,
      jobRepo,
      translationProvider,
      eventEmitter,
      novelCacheService,
      concurrencyGate: {
        run: jest.fn((task: () => Promise<unknown>) => task()),
      },
    });

    await (worker as never as { processChunk: Function }).processChunk(
      chapter,
      chunk,
      'chapter-job-1',
    );

    expect(updateQuery.set).toHaveBeenCalledWith(
      expect.objectContaining({
        translatedContent: 'Doan mot',
        mergedMetadata: expect.objectContaining({
          readableSegmentCount: 1,
        }),
      }),
    );
    expect(novelCacheService.invalidateBookAndChapterCaches).toHaveBeenCalledWith(
      'book-1',
      'chapter-1',
    );
    expect(eventEmitter.emit).toHaveBeenCalledWith(
      'chapter.progress',
      expect.objectContaining({
        completedChunks: 1,
        totalChunks: 1,
        percent: 100,
        status: ChapterStatus.TRANSLATING,
      }),
    );
    expect(calls).toEqual(['chapter:update', 'sse:emit']);
  });

  it('delays a chapter job when an earlier chapter in the same book is not done', async () => {
    const previousChapterQuery = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      addOrderBy: jest.fn().mockReturnThis(),
      getOne: jest.fn().mockResolvedValue({
        id: 'chapter-1',
        chapterNumber: 1,
        status: ChapterStatus.TRANSLATING,
      }),
    };
    const chapterRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'chapter-2',
        bookId: 'book-1',
        chapterNumber: 2,
        translationRevision: 1,
      }),
      createQueryBuilder: jest.fn().mockReturnValue(previousChapterQuery),
      update: jest.fn(),
    };
    const worker = createWorker({
      chapterRepo,
      chunkRepo: {},
      jobRepo: {},
      translationProvider: {},
      eventEmitter: {},
      novelCacheService: {},
      concurrencyGate: {},
    });
    const job = {
      data: {
        chapterId: 'chapter-2',
        translationRevision: 1,
      },
      token: 'token-1',
      moveToDelayed: jest.fn().mockResolvedValue(undefined),
    };

    await expect(worker.process(job as never)).rejects.toBeInstanceOf(
      DelayedError,
    );

    expect(job.moveToDelayed).toHaveBeenCalledWith(
      expect.any(Number),
      'token-1',
    );
    expect(chapterRepo.update).not.toHaveBeenCalled();
  });
});
