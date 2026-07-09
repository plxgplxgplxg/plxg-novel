import { ChapterService } from './chapter.service';
import { ChapterStatus } from '../../database/entities/chapter.entity';
import { SegmentStatus } from '../../database/entities/segment.entity';

describe('ChapterService', () => {
  const createReadQueryBuilder = (row: Record<string, unknown>) => ({
    innerJoin: jest.fn().mockReturnThis(),
    select: jest.fn().mockReturnThis(),
    where: jest.fn().mockReturnThis(),
    getRawOne: jest.fn().mockResolvedValue(row),
  });

  it('prefers merged content without loading segments', async () => {
    const chapterQueryBuilder = createReadQueryBuilder({
      id: 'chapter-1',
      bookId: 'book-1',
      chapterNumber: 1,
      titleOriginal: 'Original',
      titleTranslated: 'Translated',
      status: ChapterStatus.DONE,
      totalSegments: 2,
      completedSegments: 2,
      translatedContent: 'legacy',
      mergedContent: 'merged body',
      mergedAt: new Date('2026-01-01T00:00:00.000Z'),
      mergeVersion: 3,
      segmentsHash: 'hash',
      mergedMetadata: {
        failedSegmentCount: 1,
        readableSegmentCount: 1,
        failedSegments: [
          {
            segmentIndex: 1,
            sourceText: 'fallback',
            errorMessage: 'provider failed',
          },
        ],
      },
      sourceFileName: 'chapter.txt',
      sourceFileSize: 120,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      bookOwnerId: 'owner-1',
    });
    const chapterRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(chapterQueryBuilder),
    };
    const segmentRepo = { find: jest.fn() };
    const redisCacheService = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const novelCacheService = {
      buildChapterReadKey: jest
        .fn()
        .mockReturnValue('chapter:read:chapter-1:v3:user:owner-1'),
    };
    const mergeQueue = { add: jest.fn(), getJob: jest.fn() };
    const service = new ChapterService(
      chapterRepo as never,
      segmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      mergeQueue as never,
      redisCacheService as never,
      novelCacheService as never,
    );

    const result = await service.findOne('chapter-1', 'owner-1');

    expect(segmentRepo.find).not.toHaveBeenCalled();
    expect(mergeQueue.add).not.toHaveBeenCalled();
    expect(result.translatedContent).toBe('merged body');
    expect(result.failedSegmentCount).toBe(1);
  });

  it('falls back to segments and enqueues merge when chapter is not merged yet', async () => {
    const chapterQueryBuilder = createReadQueryBuilder({
      id: 'chapter-1',
      bookId: 'book-1',
      chapterNumber: 1,
      titleOriginal: 'Original',
      titleTranslated: 'Translated',
      status: ChapterStatus.DONE,
      totalSegments: 2,
      completedSegments: 2,
      translatedContent: '',
      mergedContent: null,
      mergedAt: null,
      mergeVersion: 2,
      segmentsHash: null,
      mergedMetadata: null,
      sourceFileName: 'chapter.txt',
      sourceFileSize: 120,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      bookOwnerId: 'owner-1',
    });
    const chapterRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(chapterQueryBuilder),
    };
    const segmentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'segment-1',
          chapterId: 'chapter-1',
          segmentIndex: 0,
          sourceText: 'nguon',
          translatedText: 'dich',
          status: SegmentStatus.DONE,
        },
        {
          id: 'segment-2',
          chapterId: 'chapter-1',
          segmentIndex: 1,
          sourceText: 'loi',
          translatedText: null,
          errorMessage: 'translation failed',
          status: SegmentStatus.FAILED,
        },
      ]),
    };
    const redisCacheService = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const novelCacheService = {
      buildChapterReadKey: jest
        .fn()
        .mockReturnValue('chapter:read:chapter-1:v2:user:owner-1'),
    };
    const mergeQueue = {
      add: jest.fn().mockResolvedValue(undefined),
      getJob: jest.fn().mockResolvedValue(null),
    };
    const service = new ChapterService(
      chapterRepo as never,
      segmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      mergeQueue as never,
      redisCacheService as never,
      novelCacheService as never,
    );

    const result = await service.findOne('chapter-1', 'owner-1');

    expect(segmentRepo.find).toHaveBeenCalledWith({
      where: { chapterId: 'chapter-1' },
      order: { segmentIndex: 'ASC' },
    });
    expect(mergeQueue.add).toHaveBeenCalledWith(
      'merge-chapter-segments',
      { chapterId: 'chapter-1' },
      expect.objectContaining({ jobId: 'merge:chapter-1' }),
    );
    expect(result.translatedContent).toContain('dich');
    expect(result.failedSegmentCount).toBe(1);
  });

  it('does not enqueue a new merge job when one already exists', async () => {
    const chapterQueryBuilder = createReadQueryBuilder({
      id: 'chapter-1',
      bookId: 'book-1',
      chapterNumber: 1,
      titleOriginal: 'Original',
      titleTranslated: 'Translated',
      status: ChapterStatus.DONE,
      totalSegments: 1,
      completedSegments: 1,
      translatedContent: '',
      mergedContent: null,
      mergedAt: null,
      mergeVersion: 2,
      segmentsHash: null,
      mergedMetadata: null,
      sourceFileName: 'chapter.txt',
      sourceFileSize: 120,
      createdAt: new Date('2026-01-01T00:00:00.000Z'),
      updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      bookOwnerId: 'owner-1',
    });
    const chapterRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(chapterQueryBuilder),
    };
    const segmentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'segment-1',
          chapterId: 'chapter-1',
          segmentIndex: 0,
          sourceText: 'nguon',
          translatedText: 'dich',
          status: SegmentStatus.DONE,
        },
      ]),
    };
    const mergeQueue = {
      add: jest.fn(),
      getJob: jest.fn().mockResolvedValue({ id: 'merge:chapter-1' }),
    };
    const service = new ChapterService(
      chapterRepo as never,
      segmentRepo as never,
      {} as never,
      {} as never,
      {} as never,
      mergeQueue as never,
      { get: jest.fn().mockResolvedValue(null), set: jest.fn() } as never,
      {
        buildChapterReadKey: jest
          .fn()
          .mockReturnValue('chapter:read:chapter-1:v2:user:owner-1'),
      } as never,
    );

    await service.findOne('chapter-1', 'owner-1');

    expect(mergeQueue.getJob).toHaveBeenCalledWith('merge:chapter-1');
    expect(mergeQueue.add).not.toHaveBeenCalled();
  });
});
