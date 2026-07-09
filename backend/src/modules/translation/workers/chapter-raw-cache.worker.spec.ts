import { ChapterRawCacheWorker } from './chapter-raw-cache.worker';

describe('ChapterRawCacheWorker', () => {
  it('rebuilds and stores raw content from source segments when chapter raw is missing', async () => {
    const chapterRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'chapter-1',
        bookId: 'book-1',
        rawContent: '',
      }),
      update: jest.fn().mockResolvedValue(undefined),
    };
    const segmentRepo = {
      find: jest.fn().mockResolvedValue([
        {
          id: 'segment-1',
          segmentIndex: 0,
          sourceText: '第一段',
          translatedText: 'đoạn 1',
          status: 'done',
        },
        {
          id: 'segment-2',
          segmentIndex: 1,
          sourceText: '\n',
          translatedText: '\n',
          status: 'done',
        },
        {
          id: 'segment-3',
          segmentIndex: 2,
          sourceText: '第二段',
          translatedText: 'đoạn 2',
          status: 'done',
        },
      ]),
    };
    const novelCacheService = {
      invalidateBookAndChapterCaches: jest.fn().mockResolvedValue(undefined),
    };
    const worker = new ChapterRawCacheWorker(
      chapterRepo as never,
      segmentRepo as never,
      novelCacheService as never,
    );

    await worker.process({ data: { chapterId: 'chapter-1' } } as never);

    expect(chapterRepo.update).toHaveBeenCalledWith('chapter-1', {
      rawContent: '第一段\n\n第二段',
    });
    expect(novelCacheService.invalidateBookAndChapterCaches).toHaveBeenCalledWith(
      'book-1',
      'chapter-1',
    );
  });
});
