import { BookService } from './book.service';
import { BookStatus } from '../../database/entities/book.entity';
import { ChapterStatus } from '../../database/entities/chapter.entity';

describe('BookService', () => {
  it('returns lightweight novel detail without loading chapter content fields', async () => {
    const chapterQueryBuilder = {
      select: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      orderBy: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getRawMany: jest.fn().mockResolvedValue([
        {
          id: 'chapter-1',
          bookId: 'book-1',
          chapterNumber: 1,
          titleOriginal: 'Chapter 1',
          titleTranslated: 'Chuong 1',
          status: ChapterStatus.DONE,
          totalSegments: 4,
          completedSegments: 4,
          createdAt: new Date('2026-01-01T00:00:00.000Z'),
          updatedAt: new Date('2026-01-02T00:00:00.000Z'),
        },
      ]),
    };
    const bookRepo = {
      findOne: jest.fn().mockResolvedValue({
        id: 'book-1',
        userId: 'owner-1',
        title: 'Novel',
        originalTitle: 'Original',
        status: BookStatus.COMPLETED,
        sourceLang: 'zh',
        targetLang: 'vi',
      }),
    };
    const chapterRepo = {
      createQueryBuilder: jest.fn().mockReturnValue(chapterQueryBuilder),
    };
    const redisCacheService = { get: jest.fn().mockResolvedValue(null), set: jest.fn() };
    const novelCacheService = {
      buildNovelDetailKey: jest.fn().mockReturnValue('novel:detail:book-1:user:owner-1'),
    };
    const service = new BookService(
      bookRepo as never,
      chapterRepo as never,
      {} as never,
      {} as never,
      redisCacheService as never,
      novelCacheService as never,
      { get: jest.fn() } as never,
    );

    const result = await service.findOneVisibleWithChapters('book-1', 'owner-1');

    expect(bookRepo.findOne).toHaveBeenCalledWith({
      where: { id: 'book-1', deletedAt: expect.anything() },
      select: {
        id: true,
        userId: true,
        title: true,
        originalTitle: true,
        status: true,
        sourceLang: true,
        targetLang: true,
      },
    });
    expect(chapterQueryBuilder.select).toHaveBeenCalledWith(
      expect.arrayContaining([
        'chapter.id AS "id"',
        'chapter.chapterNumber AS "chapterNumber"',
        'chapter.titleOriginal AS "titleOriginal"',
      ]),
    );
    expect(result.chapters[0]).not.toHaveProperty('rawContent');
    expect(result.chapters[0]).not.toHaveProperty('mergedContent');
  });
});
