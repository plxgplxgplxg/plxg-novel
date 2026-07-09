import {
  Injectable,
  NotFoundException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  NOVEL_DETAIL_TTL_SECONDS,
  NOVEL_LIST_TTL_SECONDS,
} from '../../cache/cache.constants';
import { NovelCacheService } from '../../cache/novel-cache.service';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { Book, BookStatus } from '../../database/entities/book.entity';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import {
  TranslationJob,
  JobType,
  JobStatus,
} from '../../database/entities/translation-job.entity';
import { CreateBookDto } from './dto/create-book.dto';
import {
  QUEUE_CHAPTER_SPLIT,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
} from '../../queue/queue.constants';

interface BookListQuery {
  search?: string;
  page?: string;
  pageSize?: string;
}

interface VisibleBookRow {
  id: string;
  title: string;
  originalTitle: string | null;
  status: BookStatus;
  createdAt: Date;
  chapterCount: number | string;
  translatedChapterCount: number | string;
  totalSegments: number | string;
  completedSegments: number | string;
  canManage: boolean | string;
}

interface VisibleChapterRow {
  id: string;
  bookId: string;
  chapterNumber: number | string;
  titleOriginal: string;
  titleTranslated: string | null;
  status: ChapterStatus;
  totalSegments: number | string;
  completedSegments: number | string;
  createdAt: Date;
  updatedAt: Date;
}

export interface BookListResponse {
  items: Array<{
    id: string;
    title: string;
    originalTitle: string | null;
    status: BookStatus;
    createdAt: Date;
    chapterCount: number;
    translatedChapterCount: number;
    totalSegments: number;
    completedSegments: number;
    canManage: boolean;
  }>;
  page: number;
  pageSize: number;
  totalItems: number;
  totalPages: number;
}

export interface BookDetailResponse {
  id: string;
  title: string;
  originalTitle: string | null;
  status: BookStatus;
  sourceLang: string;
  targetLang: string;
  chapterCount: number;
  translatedChapterCount: number;
  totalSegments: number;
  completedSegments: number;
  canManage: boolean;
  chapters: Array<{
    id: string;
    bookId: string;
    chapterNumber: number;
    titleOriginal: string;
    titleTranslated: string;
    status: ChapterStatus;
    totalSegments: number;
    completedSegments: number;
    hasReadableContent: boolean;
    createdAt: Date;
    updatedAt: Date;
  }>;
}

const READABLE_CHAPTER_PREDICATE = `
  (
    visible_chapter."totalSegments" > 0
    AND visible_chapter."completedSegments" >= visible_chapter."totalSegments"
  )
`;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

@Injectable()
export class BookService {
  private readonly logger = new Logger(BookService.name);

  constructor(
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @InjectQueue(QUEUE_CHAPTER_SPLIT)
    private readonly splitQueue: Queue,
    private readonly redisCacheService: RedisCacheService,
    private readonly novelCacheService: NovelCacheService,
  ) {}

  async create(userId: string, dto: CreateBookDto): Promise<Book> {
    const book = this.bookRepo.create({
      userId,
      title: dto.title,
      originalTitle: dto.originalTitle,
    });
    const saved = await this.bookRepo.save(book);
    await this.novelCacheService.invalidateNovelLists();
    return saved;
  }

  async findAllVisibleBooks(userId: string | null, query: BookListQuery) {
    const startedAt = Date.now();
    const page = this.parsePositiveInt(query.page, DEFAULT_PAGE);
    const pageSize = Math.min(
      this.parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const cacheKey = this.novelCacheService.buildNovelListKey(
      {
        search: query.search?.trim() || null,
        pageSize,
        scope: userId ? `user:${userId}` : 'public',
      },
      page,
    );

    const cached = await this.redisCacheService.get<BookListResponse>(cacheKey);
    if (cached) {
      this.logger.debug(
        `findAllVisibleBooks cacheHit=true page=${page} queryCount=0 durationMs=${Date.now() - startedAt}`,
      );
      return cached;
    }

    const offset = (page - 1) * pageSize;
    const baseQuery = this.buildVisibleBooksBaseQuery(userId, query.search);
    const totalItems = await baseQuery.getCount();

    const rows = await baseQuery
      .clone()
      .leftJoin(Chapter, 'chapter', 'chapter.bookId = book.id')
      .select([
        'book.id AS "id"',
        'book.title AS "title"',
        'book.originalTitle AS "originalTitle"',
        'book.status AS "status"',
        'book.createdAt AS "createdAt"',
        'COUNT(chapter.id)::int AS "chapterCount"',
        'COALESCE(SUM(chapter."totalSegments"), 0)::int AS "totalSegments"',
        'COALESCE(SUM(chapter."completedSegments"), 0)::int AS "completedSegments"',
        `COALESCE(SUM(CASE WHEN chapter.status = 'done' THEN 1 ELSE 0 END), 0)::int AS "translatedChapterCount"`,
        userId
          ? `CASE WHEN book.user_id = :userId THEN TRUE ELSE FALSE END AS "canManage"`
          : 'FALSE AS "canManage"',
      ])
      .groupBy('book.id')
      .orderBy('book.createdAt', 'DESC')
      .offset(offset)
      .limit(pageSize)
      .getRawMany<VisibleBookRow>();

    const response = {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        originalTitle: row.originalTitle,
        status: row.status,
        createdAt: row.createdAt,
        chapterCount: Number(row.chapterCount),
        translatedChapterCount: Number(row.translatedChapterCount),
        totalSegments: Number(row.totalSegments),
        completedSegments: Number(row.completedSegments),
        canManage:
          typeof row.canManage === 'boolean' ? row.canManage : row.canManage === 'true',
      })),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };

    await this.redisCacheService.set(
      cacheKey,
      response,
      NOVEL_LIST_TTL_SECONDS,
    );
    this.logger.debug(
      `findAllVisibleBooks cacheHit=false page=${page} queryCount=2 durationMs=${Date.now() - startedAt}`,
    );
    return response;
  }

  async findOneVisibleWithChapters(id: string, userId: string | null) {
    const startedAt = Date.now();
    const scope = userId ? `user:${userId}` : 'public';
    const cacheKey = this.novelCacheService.buildNovelDetailKey(id, scope);
    const cached = await this.redisCacheService.get<BookDetailResponse>(cacheKey);
    if (cached) {
      this.logger.debug(
        `findOneVisibleWithChapters cacheHit=true bookId=${id} queryCount=0 durationMs=${Date.now() - startedAt}`,
      );
      return cached;
    }

    const book = await this.bookRepo.findOne({
      where: { id, deletedAt: IsNull() },
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
    if (!book) {
      throw new NotFoundException('Book not found');
    }

    const canManage = userId === book.userId;
    const chapterQuery = this.chapterRepo
      .createQueryBuilder('chapter')
      .select([
        'chapter.id AS "id"',
        'chapter.bookId AS "bookId"',
        'chapter.chapterNumber AS "chapterNumber"',
        'chapter.titleOriginal AS "titleOriginal"',
        'chapter.titleTranslated AS "titleTranslated"',
        'chapter.status AS "status"',
        'chapter.totalSegments AS "totalSegments"',
        'chapter.completedSegments AS "completedSegments"',
        'chapter.createdAt AS "createdAt"',
        'chapter.updatedAt AS "updatedAt"',
      ])
      .where('chapter.bookId = :bookId', { bookId: id })
      .orderBy('chapter.chapterNumber', 'ASC');

    if (!canManage) {
      chapterQuery.andWhere(
        'chapter.totalSegments > 0 AND chapter.completedSegments >= chapter.totalSegments',
      );
    }

    const visibleChapterRows =
      await chapterQuery.getRawMany<VisibleChapterRow>();

    if (!canManage && visibleChapterRows.length === 0) {
      throw new NotFoundException('Book not found');
    }

    const chapters = visibleChapterRows.map((chapter) => ({
      id: chapter.id,
      bookId: chapter.bookId,
      chapterNumber: Number(chapter.chapterNumber),
      titleOriginal: chapter.titleOriginal,
      titleTranslated: chapter.titleTranslated ?? '',
      status: chapter.status,
      totalSegments: Number(chapter.totalSegments),
      completedSegments: Number(chapter.completedSegments),
      hasReadableContent:
        Number(chapter.totalSegments) > 0 &&
        Number(chapter.completedSegments) >= Number(chapter.totalSegments),
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
    }));

    const response = {
      id: book.id,
      title: book.title,
      originalTitle: book.originalTitle,
      status: book.status,
      sourceLang: book.sourceLang,
      targetLang: book.targetLang,
      chapterCount: chapters.length,
      translatedChapterCount: chapters.filter(
        (chapter) => chapter.status === ChapterStatus.DONE,
      ).length,
      totalSegments: chapters.reduce(
        (sum, chapter) => sum + chapter.totalSegments,
        0,
      ),
      completedSegments: chapters.reduce(
        (sum, chapter) => sum + chapter.completedSegments,
        0,
      ),
      canManage,
      chapters,
    };

    await this.redisCacheService.set(
      cacheKey,
      response,
      NOVEL_DETAIL_TTL_SECONDS,
    );
    this.logger.debug(
      `findOneVisibleWithChapters cacheHit=false bookId=${id} queryCount=2 durationMs=${Date.now() - startedAt}`,
    );
    return response;
  }

  async getStatus(id: string, userId: string): Promise<Book> {
    const book = await this.bookRepo.findOne({
      where: { id, userId },
      relations: { chapters: true },
    });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  async startTranslation(
    id: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    const book = await this.bookRepo.findOne({
      where: { id, userId },
      relations: { chapters: true },
    });
    if (!book) throw new NotFoundException('Book not found');

    const pendingChapters = book.chapters.filter(
      (c) =>
        c.status === ChapterStatus.PENDING || c.status === ChapterStatus.FAILED,
    );

    if (pendingChapters.length === 0) {
      throw new BadRequestException('No chapters to translate');
    }

    return this.enqueueChaptersForTranslation(id, pendingChapters);
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id, userId } });
    if (!book) throw new NotFoundException('Book not found');
    await this.bookRepo.update(id, { deletedAt: new Date() });
    await this.novelCacheService.invalidateBookAndChapterCaches(id);
  }

  private async enqueueChaptersForTranslation(
    bookId: string,
    chapters: Chapter[],
  ): Promise<{ jobId: string }> {
    const bookJob = await this.jobRepo.save(
      this.jobRepo.create({
        bookId,
        jobType: JobType.TRANSLATE_BOOK,
        status: JobStatus.QUEUED,
      }),
    );

    const chapterJobs = await this.jobRepo.save(
      chapters.map((chapter) =>
        this.jobRepo.create({
          bookId,
          chapterId: chapter.id,
          jobType: JobType.TRANSLATE_CHAPTER,
          status: JobStatus.QUEUED,
        }),
      ),
    );

    const chapterJobByChapterId = new Map(
      chapterJobs.map((job) => [job.chapterId, job.id]),
    );

    await this.bookRepo.update(bookId, { status: BookStatus.PROCESSING });
    await this.novelCacheService.invalidateBookAndChapterCaches(bookId);

    await this.splitQueue.addBulk(
      chapters.map((chapter) => ({
        name: 'split-chapter',
        data: {
          chapterId: chapter.id,
          bookJobId: bookJob.id,
          chapterJobId: chapterJobByChapterId.get(chapter.id),
        },
        opts: {
          attempts: MAX_RETRY_ATTEMPTS,
          backoff: BULLMQ_BACKOFF_CONFIG,
        },
      })),
    );

    return { jobId: bookJob.id };
  }

  private buildVisibleBooksBaseQuery(
    userId: string | null,
    search?: string,
  ) {
    const baseQuery = this.bookRepo
      .createQueryBuilder('book')
      .andWhere('book.deletedAt IS NULL');

    if (userId) {
      baseQuery.andWhere(
        `(book.user_id = :userId OR EXISTS (
          SELECT 1
          FROM chapters visible_chapter
          WHERE visible_chapter.book_id = book.id
            AND ${READABLE_CHAPTER_PREDICATE}
        ))`,
        { userId },
      );
    } else {
      baseQuery.andWhere(
        `EXISTS (
          SELECT 1
          FROM chapters visible_chapter
          WHERE visible_chapter.book_id = book.id
            AND ${READABLE_CHAPTER_PREDICATE}
        )`,
      );
    }

    if (search?.trim()) {
      baseQuery.andWhere(
        '(book.title ILIKE :search OR book.originalTitle ILIKE :search)',
        { search: `%${search.trim()}%` },
      );
    }

    return baseQuery;
  }

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
