import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull } from 'typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Book, BookStatus } from '../../database/entities/book.entity';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import { Segment, SegmentStatus } from '../../database/entities/segment.entity';
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
import { PARAGRAPH_MARKER } from '../chapter/chapter-readability';

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
  chapterCount: number;
  translatedChapterCount: number;
  totalSegments: number;
  completedSegments: number;
  canManage: boolean;
}

const READABLE_CHAPTER_PREDICATE = `
  (
    visible_chapter.status = :doneStatus
    OR (
      visible_chapter.status = :failedStatus
      AND visible_chapter.translatedContent IS NOT NULL
      AND visible_chapter.translatedContent <> ''
    )
  )
`;

const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 12;
const MAX_PAGE_SIZE = 50;

@Injectable()
export class BookService {
  constructor(
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @InjectQueue(QUEUE_CHAPTER_SPLIT)
    private readonly splitQueue: Queue,
  ) {}

  async create(userId: string, dto: CreateBookDto): Promise<Book> {
    const book = this.bookRepo.create({
      userId,
      title: dto.title,
      originalTitle: dto.originalTitle,
    });
    return this.bookRepo.save(book);
  }

  async findAllVisibleBooks(userId: string | null, query: BookListQuery) {
    const page = this.parsePositiveInt(query.page, DEFAULT_PAGE);
    const pageSize = Math.min(
      this.parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const offset = (page - 1) * pageSize;

    const baseQuery = this.bookRepo
      .createQueryBuilder('book')
      .andWhere('book.deletedAt IS NULL');

    if (userId) {
      baseQuery.andWhere(
        `(book.userId = :userId OR EXISTS (
          SELECT 1
          FROM chapters visible_chapter
          WHERE visible_chapter.bookId = book.id
            AND ${READABLE_CHAPTER_PREDICATE}
        ))`,
        {
          userId,
          doneStatus: ChapterStatus.DONE,
          failedStatus: ChapterStatus.FAILED,
        },
      );
    } else {
      baseQuery.andWhere(
        `EXISTS (
          SELECT 1
          FROM chapters visible_chapter
          WHERE visible_chapter.bookId = book.id
            AND ${READABLE_CHAPTER_PREDICATE}
        )`,
        {
          doneStatus: ChapterStatus.DONE,
          failedStatus: ChapterStatus.FAILED,
        },
      );
    }

    if (query.search?.trim()) {
      baseQuery.andWhere(
        '(book.title ILIKE :search OR book.originalTitle ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

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
        'COALESCE(SUM(chapter.totalSegments), 0)::int AS "totalSegments"',
        'COALESCE(SUM(chapter.completedSegments), 0)::int AS "completedSegments"',
        `COALESCE(SUM(CASE WHEN chapter.status = 'done' THEN 1 ELSE 0 END), 0)::int AS "translatedChapterCount"`,
        userId
          ? `CASE WHEN book.userId = :userId THEN TRUE ELSE FALSE END AS "canManage"`
          : 'FALSE AS "canManage"',
      ])
      .groupBy('book.id')
      .orderBy('book.createdAt', 'DESC')
      .offset(offset)
      .limit(pageSize)
      .getRawMany<VisibleBookRow>();

    return {
      items: rows.map((row) => ({
        id: row.id,
        title: row.title,
        originalTitle: row.originalTitle,
        status: row.status,
        createdAt: row.createdAt,
        chapterCount: row.chapterCount,
        translatedChapterCount: row.translatedChapterCount,
        totalSegments: row.totalSegments,
        completedSegments: row.completedSegments,
        canManage: row.canManage,
      })),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
    };
  }

  async findOneVisibleWithChapters(id: string, userId: string | null) {
    const book = await this.bookRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { chapters: true },
      order: { chapters: { chapterNumber: 'ASC' } },
    });
    if (!book) throw new NotFoundException('Book not found');

    const canManage = userId === book.userId;
    const readableSegmentCounts = await this.getReadableSegmentCounts(
      book.chapters.map((chapter) => chapter.id),
    );
    const visibleChapters = canManage
      ? book.chapters
      : book.chapters.filter(
          (chapter) =>
            chapter.status === ChapterStatus.DONE ||
            (readableSegmentCounts.get(chapter.id) ?? 0) > 0 ||
            Boolean(chapter.translatedContent?.trim()),
        );

    if (!canManage && visibleChapters.length === 0) {
      throw new NotFoundException('Book not found');
    }

    return {
      id: book.id,
      title: book.title,
      originalTitle: book.originalTitle,
      status: book.status,
      sourceLang: book.sourceLang,
      targetLang: book.targetLang,
      chapterCount: visibleChapters.length,
      translatedChapterCount: visibleChapters.filter(
        (chapter) => chapter.status === ChapterStatus.DONE,
      ).length,
      totalSegments: visibleChapters.reduce(
        (sum, chapter) => sum + chapter.totalSegments,
        0,
      ),
      completedSegments: visibleChapters.reduce(
        (sum, chapter) => sum + chapter.completedSegments,
        0,
      ),
      canManage,
      chapters: visibleChapters.map((chapter) => ({
        id: chapter.id,
        bookId: chapter.bookId,
        chapterNumber: chapter.chapterNumber,
        titleOriginal: chapter.titleOriginal,
        titleTranslated: chapter.titleTranslated,
        status: chapter.status,
        totalSegments: chapter.totalSegments,
        completedSegments: chapter.completedSegments,
        hasReadableContent:
          chapter.status === ChapterStatus.DONE ||
          (readableSegmentCounts.get(chapter.id) ?? 0) > 0 ||
          Boolean(chapter.translatedContent?.trim()),
        createdAt: chapter.createdAt,
        updatedAt: chapter.updatedAt,
      })),
    };
  }

  private async getReadableSegmentCounts(chapterIds: string[]) {
    if (chapterIds.length === 0) {
      return new Map<string, number>();
    }

    const rows = await this.segmentRepo
      .createQueryBuilder('segment')
      .select('segment.chapterId', 'chapterId')
      .addSelect('COUNT(segment.id)::int', 'readableSegmentCount')
      .where('segment.chapterId IN (:...chapterIds)', { chapterIds })
      .andWhere('segment.status != :failedStatus', {
        failedStatus: SegmentStatus.FAILED,
      })
      .andWhere('segment.sourceText != :paragraphMarker', {
        paragraphMarker: PARAGRAPH_MARKER,
      })
      .andWhere(`BTRIM(segment.sourceText) <> ''`)
      .groupBy('segment.chapterId')
      .getRawMany<{ chapterId: string; readableSegmentCount: number }>();

    return new Map(
      rows.map((row) => [row.chapterId, Number(row.readableSegmentCount)]),
    );
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

  private parsePositiveInt(raw: string | undefined, fallback: number): number {
    const parsed = Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }
}
