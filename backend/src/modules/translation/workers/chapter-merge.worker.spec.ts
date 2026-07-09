import { ChapterMergeWorker } from './chapter-merge.worker';
import { buildChapterMergePayload } from '../../chapter/chapter-merge';

describe('ChapterMergeWorker', () => {
  it('skips update when merged hash is unchanged', async () => {
    const segments = [
      {
        id: 'segment-1',
        segmentIndex: 0,
        sourceText: 'source',
        translatedText: 'translated',
        status: 'done',
        updatedAt: new Date('2026-01-01T00:00:00.000Z'),
      },
    ];
    const { segmentsHash } = buildChapterMergePayload(segments as never);
    const chapterRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'chapter-1',
        bookId: 'book-1',
        mergedAt: new Date('2026-01-01T00:00:00.000Z'),
        segmentsHash,
        mergeVersion: 4,
      }),
    };
    const segmentRepo = {
      find: jest.fn().mockResolvedValue(segments),
    };
    const dataSource = {
      transaction: jest.fn(),
    };
    const redisCacheService = {
      acquireLock: jest.fn().mockResolvedValue('token'),
      releaseLock: jest.fn().mockResolvedValue(undefined),
    };
    const novelCacheService = {
      invalidateBookAndChapterCaches: jest.fn(),
    };
    const worker = new ChapterMergeWorker(
      chapterRepo as never,
      segmentRepo as never,
      dataSource as never,
      redisCacheService as never,
      novelCacheService as never,
    );

    await worker.process({ data: { chapterId: 'chapter-1' } } as never);

    expect(dataSource.transaction).not.toHaveBeenCalled();
    expect(novelCacheService.invalidateBookAndChapterCaches).not.toHaveBeenCalled();
    expect(redisCacheService.releaseLock).toHaveBeenCalledWith(
      'lock:chapter-merge:chapter-1',
      'token',
    );
  });
});
