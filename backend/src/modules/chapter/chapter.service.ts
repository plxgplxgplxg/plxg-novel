import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import {
  CHAPTER_READ_FALLBACK_TTL_SECONDS,
  CHAPTER_READ_MERGED_TTL_SECONDS,
} from '../../cache/cache.constants';
import { NovelCacheService } from '../../cache/novel-cache.service';
import { RedisCacheService } from '../../cache/redis-cache.service';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import { Segment } from '../../database/entities/segment.entity';
import {
  ChapterChunk,
  ChapterChunkStatus,
} from '../../database/entities/chapter-chunk.entity';
import { Book, BookStatus } from '../../database/entities/book.entity';
import {
  TranslationJob,
  JobStatus,
  JobType,
} from '../../database/entities/translation-job.entity';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { ListBookChaptersDto } from './dto/list-book-chapters.dto';
import {
  QUEUE_CHAPTER_MERGE,
  QUEUE_CHAPTER_RAW_CACHE,
  QUEUE_TRANSLATION,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
} from '../../queue/queue.constants';
import { resolveBookChapterConcurrency } from '../../queue/translation-tuning';
import {
  buildRawChapterContent,
  buildReadableChapterContent,
  getFailedSegmentDiagnostics,
} from './chapter-readability';
import {
  buildReadableChunkContent,
  getFailedChunkDiagnostics,
} from '../translation/chunker/chapter-chunk-readability';

const CHAPTER_NUMBER_PATTERN = /^((第[一二三四五六七八九十百千万零两\d]+章)|Chapter\s+(\d+))/i;
const DEFAULT_PAGE = 1;
const DEFAULT_PAGE_SIZE = 8;
const MAX_PAGE_SIZE = 20;

interface UploadSourceMetadata {
  sourceFileName: string;
  sourceFileSize: number;
}

interface ParsedChapterBlock {
  number: number;
  title: string;
  content: string;
}

interface ChapterReadRow {
  id: string;
  bookId: string;
  chapterNumber: number;
  titleOriginal: string;
  titleTranslated: string | null;
  rawContent: string | null;
  status: ChapterStatus;
  totalSegments: number;
  completedSegments: number;
  translatedContent: string | null;
  mergedContent: string | null;
  mergedAt: Date | null;
  mergeVersion: number;
  translationRevision: number;
  segmentsHash: string | null;
  mergedMetadata:
    | {
        failedSegmentCount: number;
        readableSegmentCount: number;
        failedSegments: Array<{
          segmentIndex: number;
          sourceText: string;
          errorMessage: string | null;
        }>;
      }
    | null;
  sourceFileName: string | null;
  sourceFileSize: number | null;
  createdAt: Date;
  updatedAt: Date;
  bookOwnerId: string;
}

export interface ChapterReadResponse {
  id: string;
  bookId: string;
  chapterNumber: number;
  titleOriginal: string;
  titleTranslated: string;
  status: ChapterStatus;
  totalSegments: number;
  completedSegments: number;
  translatedContent: string;
  rawContent: string;
  failedSegmentCount: number;
  readableSegmentCount: number;
  hasReadableContent: boolean;
  failedSegments: Array<{
    segmentIndex: number;
    sourceText: string;
    errorMessage: string | null;
  }>;
  createdAt: Date;
  updatedAt: Date;
  sourceFileName?: string;
  sourceFileSize?: number;
  canManage: boolean;
}

@Injectable()
export class ChapterService {
  private readonly logger = new Logger(ChapterService.name);

  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(ChapterChunk)
    private readonly chunkRepo: Repository<ChapterChunk>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
    @InjectQueue(QUEUE_CHAPTER_MERGE)
    private readonly mergeQueue: Queue,
    @InjectQueue(QUEUE_CHAPTER_RAW_CACHE)
    private readonly rawCacheQueue: Queue,
    private readonly redisCacheService: RedisCacheService,
    private readonly novelCacheService: NovelCacheService,
    private readonly configService: ConfigService,
  ) {}

  async addChapter(
    bookId: string,
    userId: string,
    dto: CreateChapterDto,
  ): Promise<Chapter> {
    await this.assertBookOwnership(bookId, userId);

    const chapter = this.chapterRepo.create({
      bookId,
      chapterNumber: dto.chapterNumber,
      titleOriginal: dto.titleOriginal,
      titleTranslated: dto.titleTranslated,
      rawContent: dto.rawContent,
    });

    const saved = await this.chapterRepo.save(chapter);
    await this.novelCacheService.invalidateBookAndChapterCaches(bookId, saved.id);
    return saved;
  }

  async uploadAndSplitChapters(
    bookId: string,
    userId: string,
    fileContent: string,
    sourceMetadata: UploadSourceMetadata,
    chapterNumberStart?: string,
  ): Promise<{ chapters: Chapter[]; jobId: string }> {
    await this.assertBookOwnership(bookId, userId);

    const nextChapterNumber = await this.getNextChapterNumber(bookId);
    const chapterBlocks = this.buildUploadChapterBlocks(
      fileContent,
      chapterNumberStart,
      nextChapterNumber,
    );

    const chapters = chapterBlocks.map((block) =>
      this.chapterRepo.create({
        bookId,
        chapterNumber: block.number,
        titleOriginal: block.title,
        rawContent: block.content,
        sourceFileName: sourceMetadata.sourceFileName,
        sourceFileSize: sourceMetadata.sourceFileSize,
      }),
    );

    try {
      const savedChapters = await this.chapterRepo.save(chapters);
      const jobId = await this.enqueueChaptersForTranslation(bookId, savedChapters);
      return { chapters: savedChapters, jobId };
    } catch (error) {
      if (this.isDuplicateChapterNumberError(error)) {
        throw new ConflictException(
          'Chapter number already exists in this book. Upload files one by one or rename chapter headings.',
        );
      }
      throw error;
    }
  }

  async listBookChapters(
    bookId: string,
    userId: string,
    query: ListBookChaptersDto,
  ) {
    await this.assertBookOwnership(bookId, userId);

    const page = this.parsePositiveInt(query.page, DEFAULT_PAGE);
    const pageSize = Math.min(
      this.parsePositiveInt(query.pageSize, DEFAULT_PAGE_SIZE),
      MAX_PAGE_SIZE,
    );
    const offset = (page - 1) * pageSize;

    const baseQuery = this.chapterRepo
      .createQueryBuilder('chapter')
      .innerJoin('chapter.book', 'book')
      .where('chapter.bookId = :bookId', { bookId })
      .andWhere('book.userId = :userId', { userId });

    if (query.search?.trim()) {
      baseQuery.andWhere(
        '(chapter.titleOriginal ILIKE :search OR chapter.titleTranslated ILIKE :search)',
        { search: `%${query.search.trim()}%` },
      );
    }

    const totalItems = await baseQuery.getCount();

    const items = await baseQuery
      .clone()
      .select([
        'chapter.id',
        'chapter.bookId',
        'chapter.chapterNumber',
        'chapter.titleOriginal',
        'chapter.titleTranslated',
        'chapter.status',
        'chapter.totalSegments',
        'chapter.completedSegments',
        'chapter.createdAt',
        'chapter.updatedAt',
        'chapter.sourceFileName',
        'chapter.sourceFileSize',
      ])
      .orderBy('chapter.chapterNumber', 'DESC')
      .addOrderBy('chapter.createdAt', 'DESC')
      .offset(offset)
      .limit(pageSize)
      .getMany();

    return {
      items: items.map((chapter) => this.toChapterSummary(chapter)),
      page,
      pageSize,
      totalItems,
      totalPages: Math.max(1, Math.ceil(totalItems / pageSize)),
      nextChapterNumber: await this.getNextChapterNumber(bookId),
    };
  }

  async findOne(id: string, userId: string | null) {
    const startedAt = Date.now();
    const chapter = await this.chapterRepo
      .createQueryBuilder('chapter')
      .innerJoin('chapter.book', 'book')
      .select([
        'chapter.id AS "id"',
        'chapter.bookId AS "bookId"',
        'chapter.chapterNumber AS "chapterNumber"',
        'chapter.titleOriginal AS "titleOriginal"',
        'chapter.titleTranslated AS "titleTranslated"',
        'chapter.rawContent AS "rawContent"',
        'chapter.status AS "status"',
        'chapter.totalSegments AS "totalSegments"',
        'chapter.completedSegments AS "completedSegments"',
        'chapter.translatedContent AS "translatedContent"',
        'chapter.mergedContent AS "mergedContent"',
        'chapter.mergedAt AS "mergedAt"',
        'chapter.mergeVersion AS "mergeVersion"',
        'chapter.translationRevision AS "translationRevision"',
        'chapter.segmentsHash AS "segmentsHash"',
        'chapter.mergedMetadata AS "mergedMetadata"',
        'chapter.sourceFileName AS "sourceFileName"',
        'chapter.sourceFileSize AS "sourceFileSize"',
        'chapter.createdAt AS "createdAt"',
        'chapter.updatedAt AS "updatedAt"',
        'book.userId AS "bookOwnerId"',
      ])
      .where('chapter.id = :id', { id })
      .getRawOne<ChapterReadRow>();

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const canManage = userId === chapter.bookOwnerId;
    const isProcessed =
      Number(chapter.totalSegments) > 0 &&
      Number(chapter.completedSegments) >= Number(chapter.totalSegments);
    if (!canManage && !isProcessed) {
      throw new ForbiddenException('Chapter is not ready to read');
    }

    const scope = canManage ? `user:${userId}` : 'public';
    const cacheKey = this.novelCacheService.buildChapterReadKey(
      chapter.id,
      Number(chapter.mergeVersion),
      scope,
    );
    const cached = await this.redisCacheService.get<ChapterReadResponse>(cacheKey);
    if (cached) {
      this.logger.debug(
        `findOne chapterId=${id} cacheHit=true queryCount=1 durationMs=${Date.now() - startedAt}`,
      );
      return cached;
    }

    const hasStoredRawContent = Boolean(chapter.rawContent?.trim());
    let segments: Segment[] | null = null;
    let chunks: ChapterChunk[] | null = null;
    let rawContent = chapter.rawContent ?? '';

    if (!hasStoredRawContent) {
      chunks = await this.chunkRepo.find({
        where: {
          chapterId: chapter.id,
          translationRevision: chapter.translationRevision,
        },
        order: { chunkIndex: 'ASC' },
      });

      if (chunks.length > 0) {
        rawContent = chunks.map((chunk) => chunk.sourceText).join('\n\n').trim();
      } else {
        segments = await this.segmentRepo.find({
          where: { chapterId: chapter.id },
          order: { segmentIndex: 'ASC' },
        });
        rawContent = buildRawChapterContent(segments) ?? '';
      }

      if (rawContent.trim()) {
        await this.enqueueRawCacheJob(chapter.id);
      }
    }

    if (chapter.mergedAt && chapter.mergedContent !== null) {
      const mergedResponse = this.buildChapterReadResponse(
        chapter,
        canManage,
        chapter.mergedContent,
        rawContent,
        chapter.mergedMetadata?.failedSegmentCount ?? 0,
        chapter.mergedMetadata?.readableSegmentCount ?? 0,
        chapter.mergedMetadata?.failedSegments ?? [],
      );
      await this.redisCacheService.set(
        cacheKey,
        mergedResponse,
        CHAPTER_READ_MERGED_TTL_SECONDS,
      );
      this.logger.debug(
        `findOne chapterId=${id} cacheHit=false merged=true queryCount=1 durationMs=${Date.now() - startedAt}`,
      );
      return mergedResponse;
    }

    const readableChunks =
      chunks ??
      (await this.chunkRepo.find({
        where: {
          chapterId: chapter.id,
          translationRevision: chapter.translationRevision,
        },
        order: { chunkIndex: 'ASC' },
      }));

    if (readableChunks.length > 0) {
      const failedSegments = getFailedChunkDiagnostics(readableChunks);
      const { content: translatedContent, readableChunkCount } =
        buildReadableChunkContent(readableChunks);

      const fallbackResponse = this.buildChapterReadResponse(
        chapter,
        canManage,
        translatedContent ?? chapter.translatedContent ?? '',
        rawContent,
        failedSegments.length,
        readableChunkCount,
        failedSegments,
      );
      await this.redisCacheService.set(
        cacheKey,
        fallbackResponse,
        CHAPTER_READ_FALLBACK_TTL_SECONDS,
      );
      this.logger.debug(
        `findOne chapterId=${id} cacheHit=false merged=false queryCount=2 durationMs=${Date.now() - startedAt}`,
      );
      return fallbackResponse;
    }

    const readableSegments =
      segments ??
      (await this.segmentRepo.find({
        where: { chapterId: chapter.id },
        order: { segmentIndex: 'ASC' },
      }));
    const failedSegments = getFailedSegmentDiagnostics(readableSegments);
    const { content: translatedContent, readableSegmentCount } =
      buildReadableChapterContent(readableSegments);

    await this.enqueueMergeJob(chapter.id);

    const fallbackResponse = this.buildChapterReadResponse(
      chapter,
      canManage,
      translatedContent ?? chapter.translatedContent ?? '',
      rawContent,
      failedSegments.length,
      readableSegmentCount,
      failedSegments,
    );
    await this.redisCacheService.set(
      cacheKey,
      fallbackResponse,
      CHAPTER_READ_FALLBACK_TTL_SECONDS,
    );
    this.logger.debug(
      `findOne chapterId=${id} cacheHit=false merged=false queryCount=2 durationMs=${Date.now() - startedAt}`,
    );
    return fallbackResponse;
  }

  async retranslateChapter(
    id: string,
    userId: string,
    retryFailedOnly: boolean = false,
  ): Promise<{ jobId: string }> {
    const chapter = await this.findChapterForOwner(id, userId);

    if (!retryFailedOnly) {
      await this.chunkRepo.delete({ chapterId: id });
      await this.segmentRepo.delete({ chapterId: id });
      await this.jobRepo.delete({ chapterId: id });
      await this.chapterRepo
        .createQueryBuilder()
        .update(Chapter)
        .set({
          status: ChapterStatus.PENDING,
          totalSegments: 0,
          completedSegments: 0,
          translatedContent: '',
          mergedContent: null,
          mergedAt: null,
          segmentsHash: null,
          mergedMetadata: null,
          mergeVersion: () => '"mergeVersion" + 1',
          translationRevision: () => '"translationRevision" + 1',
        })
        .where('id = :id', { id })
        .execute();
    } else {
      await this.chapterRepo.update(id, {
        status: ChapterStatus.PENDING,
      });
    }

    await this.novelCacheService.invalidateBookAndChapterCaches(chapter.bookId, id);

    const refreshedChapter = await this.chapterRepo.findOne({ where: { id } });
    if (!refreshedChapter) {
      throw new NotFoundException('Chapter not found');
    }

    const jobId = await this.enqueueChaptersForTranslation(
      chapter.bookId,
      [refreshedChapter],
      false,
    );
    return { jobId };
  }

  async replaceChapterSourceFile(
    id: string,
    userId: string,
    fileContent: string,
    sourceMetadata: UploadSourceMetadata,
  ): Promise<{ chapter: ReturnType<ChapterService['toChapterSummary']>; jobId: string }> {
    const chapter = await this.findChapterForOwner(id, userId);
    const replacementBlock = this.buildReplacementBlock(fileContent, chapter);

    await this.chunkRepo.delete({ chapterId: chapter.id });
    await this.segmentRepo.delete({ chapterId: chapter.id });
    await this.jobRepo.delete({ chapterId: chapter.id });
    await this.chapterRepo
      .createQueryBuilder()
      .update(Chapter)
      .set({
        titleOriginal: replacementBlock.title,
        rawContent: replacementBlock.content,
        sourceFileName: sourceMetadata.sourceFileName,
        sourceFileSize: sourceMetadata.sourceFileSize,
        status: ChapterStatus.PENDING,
        totalSegments: 0,
        completedSegments: 0,
        translatedContent: '',
        mergedContent: null,
        mergedAt: null,
        segmentsHash: null,
        mergedMetadata: null,
        titleTranslated: '',
        mergeVersion: () => '"mergeVersion" + 1',
        translationRevision: () => '"translationRevision" + 1',
      })
      .where('id = :id', { id: chapter.id })
      .execute();

    await this.novelCacheService.invalidateBookAndChapterCaches(
      chapter.bookId,
      chapter.id,
    );

    const refreshedChapter = await this.chapterRepo.findOne({
      where: { id: chapter.id },
      select: {
        id: true,
        bookId: true,
        chapterNumber: true,
        titleOriginal: true,
        titleTranslated: true,
        status: true,
        totalSegments: true,
        completedSegments: true,
        createdAt: true,
        updatedAt: true,
        sourceFileName: true,
        sourceFileSize: true,
      },
    });

    if (!refreshedChapter) {
      throw new NotFoundException('Chapter not found');
    }

    const jobId = await this.enqueueChaptersForTranslation(
      chapter.bookId,
      [refreshedChapter],
      false,
    );

    return {
      chapter: this.toChapterSummary(refreshedChapter),
      jobId,
    };
  }

  private buildChapterReadResponse(
    chapter: ChapterReadRow,
    canManage: boolean,
    translatedContent: string,
    rawContent: string,
    failedSegmentCount: number,
    readableSegmentCount: number,
    failedSegments: Array<{
      segmentIndex: number;
      sourceText: string;
      errorMessage: string | null;
    }>,
  ): ChapterReadResponse {
    return {
      id: chapter.id,
      bookId: chapter.bookId,
      chapterNumber: Number(chapter.chapterNumber),
      titleOriginal: chapter.titleOriginal,
      titleTranslated: chapter.titleTranslated ?? '',
      status: chapter.status,
      totalSegments: Number(chapter.totalSegments),
      completedSegments: Number(chapter.completedSegments),
      translatedContent,
      rawContent,
      failedSegmentCount,
      readableSegmentCount,
      hasReadableContent:
        Number(chapter.totalSegments) > 0 &&
        Number(chapter.completedSegments) >= Number(chapter.totalSegments),
      failedSegments,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
      sourceFileName: chapter.sourceFileName ?? undefined,
      sourceFileSize: chapter.sourceFileSize ?? undefined,
      canManage,
    };
  }

  private async enqueueMergeJob(chapterId: string): Promise<void> {
    const jobId = `merge:${chapterId}`;

    try {
      const existingJob = await this.mergeQueue.getJob(jobId);
      if (existingJob) {
        return;
      }

      await this.mergeQueue.add(
        'merge-chapter-segments',
        { chapterId },
        {
          jobId,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue merge job for chapter ${chapterId}: ${String(error)}`,
      );
    }
  }

  private async enqueueRawCacheJob(chapterId: string): Promise<void> {
    const jobId = `raw-cache:${chapterId}`;

    try {
      const existingJob = await this.rawCacheQueue.getJob(jobId);
      if (existingJob) {
        return;
      }

      await this.rawCacheQueue.add(
        'cache-chapter-raw-content',
        { chapterId },
        {
          jobId,
          attempts: 1,
          removeOnComplete: true,
          removeOnFail: true,
        },
      );
    } catch (error) {
      this.logger.warn(
        `Failed to enqueue raw cache job for chapter ${chapterId}: ${String(error)}`,
      );
    }
  }

  private async assertBookOwnership(
    bookId: string,
    userId: string,
  ): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id: bookId, userId } });
    if (!book) throw new NotFoundException('Book not found');
  }

  private async findChapterForOwner(
    id: string,
    userId: string,
  ): Promise<Chapter> {
    const chapter = await this.chapterRepo.findOne({
      where: { id },
      relations: { book: true },
    });

    if (!chapter || chapter.book.userId !== userId) {
      throw new NotFoundException('Chapter not found');
    }

    return chapter;
  }

  private buildUploadChapterBlocks(
    fileContent: string,
    chapterNumberStart: string | undefined,
    nextChapterNumber: number,
  ): ParsedChapterBlock[] {
    const parsedBlocks = this.extractChaptersFromText(fileContent);
    const explicitStart = this.parseOptionalChapterNumber(chapterNumberStart);

    if (parsedBlocks.length === 0) {
      const chapterNumber = explicitStart ?? nextChapterNumber;
      return [
        {
          number: chapterNumber,
          title: `Chapter ${chapterNumber}`,
          content: fileContent.trim(),
        },
      ];
    }

    if (explicitStart) {
      return parsedBlocks.map((block, index) => ({
        ...block,
        number: explicitStart + index,
      }));
    }

    return parsedBlocks;
  }

  private buildReplacementBlock(
    fileContent: string,
    chapter: Chapter,
  ): ParsedChapterBlock {
    const parsedBlocks = this.extractChaptersFromText(fileContent);

    if (parsedBlocks.length > 1) {
      throw new BadRequestException(
        'Replacement file must contain exactly one chapter.',
      );
    }

    if (parsedBlocks.length === 1) {
      return {
        number: chapter.chapterNumber,
        title: parsedBlocks[0].title,
        content: parsedBlocks[0].content,
      };
    }

    return {
      number: chapter.chapterNumber,
      title: chapter.titleOriginal,
      content: fileContent.trim(),
    };
  }

  private async enqueueChaptersForTranslation(
    bookId: string,
    chapters: Chapter[],
    enqueueFollowingChapters = true,
  ): Promise<string> {
    const orderedChapters = [...chapters].sort(
      (left, right) =>
        left.chapterNumber - right.chapterNumber ||
        left.createdAt.getTime() - right.createdAt.getTime(),
    );
    const firstChapter = orderedChapters[0];

    if (!firstChapter) {
      throw new BadRequestException('No chapters to translate');
    }

    const bookJob = await this.jobRepo.save(
      this.jobRepo.create({
        bookId,
        jobType: JobType.TRANSLATE_BOOK,
        status: JobStatus.QUEUED,
        translationRevision: firstChapter.translationRevision,
      }),
    );

    await this.bookRepo.update(bookId, { status: BookStatus.PROCESSING });
    await this.novelCacheService.invalidateBookAndChapterCaches(bookId);

    await this.enqueueChapterWindow(
      bookId,
      bookJob.id,
      orderedChapters.slice(
        0,
        resolveBookChapterConcurrency(this.configService),
      ),
      enqueueFollowingChapters,
    );

    return bookJob.id;
  }

  private async enqueueChapterWindow(
    bookId: string,
    bookJobId: string,
    chapters: Chapter[],
    enqueueFollowingChapters: boolean,
  ): Promise<void> {
    for (const chapter of chapters) {
      const chapterJob = await this.jobRepo.save(
        this.jobRepo.create({
          bookId,
          chapterId: chapter.id,
          jobType: JobType.TRANSLATE_CHAPTER,
          status: JobStatus.QUEUED,
          translationRevision: chapter.translationRevision,
        }),
      );

      const bullmqJobId = `translate-chapter:${chapter.id}:${chapter.translationRevision}`;

      await this.translationQueue.add(
        'translate-chapter',
        {
          chapterId: chapter.id,
          bookJobId,
          chapterJobId: chapterJob.id,
          translationRevision: chapter.translationRevision,
          enqueueFollowingChapters,
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
    }
  }

  private extractChaptersFromText(text: string): ParsedChapterBlock[] {
    const lines = text.split('\n');
    const chapters: Array<{ number: number; title: string; content: string }> =
      [];
    let currentChapter: {
      number: number;
      title: string;
      lines: string[];
    } | null = null;

    for (const line of lines) {
      const match = line.trim().match(CHAPTER_NUMBER_PATTERN);

      if (match) {
        if (currentChapter) {
          chapters.push({
            number: currentChapter.number,
            title: currentChapter.title,
            content: currentChapter.lines.join('\n').trim(),
          });
        }

        const chapterNum = this.parseChapterNumber(match[2] || match[3]);
        currentChapter = { number: chapterNum, title: line.trim(), lines: [] };
      } else if (currentChapter) {
        currentChapter.lines.push(line);
      }
    }

    if (currentChapter) {
      chapters.push({
        number: currentChapter.number,
        title: currentChapter.title,
        content: currentChapter.lines.join('\n').trim(),
      });
    }

    return chapters;
  }

  private parseChapterNumber(raw: string | undefined): number {
    if (!raw) return 1;

    const numeric = Number.parseInt(raw, 10);
    if (!Number.isNaN(numeric)) return numeric;

    return this.parseChineseNumber(raw.replace(/^第|章$/g, ''));
  }

  private parseChineseNumber(raw: string): number {
    const digitMap: Record<string, number> = {
      零: 0,
      一: 1,
      二: 2,
      两: 2,
      三: 3,
      四: 4,
      五: 5,
      六: 6,
      七: 7,
      八: 8,
      九: 9,
    };
    const unitMap: Record<string, number> = {
      十: 10,
      百: 100,
      千: 1000,
      万: 10000,
    };

    let total = 0;
    let section = 0;
    let current = 0;

    for (const char of raw) {
      if (char in digitMap) {
        current = digitMap[char];
        continue;
      }

      const unit = unitMap[char];
      if (!unit) continue;

      if (unit === 10000) {
        section = (section + (current || 0)) * unit;
        total += section;
        section = 0;
        current = 0;
        continue;
      }

      section += (current || 1) * unit;
      current = 0;
    }

    return total + section + current;
  }

  private isDuplicateChapterNumberError(error: unknown): boolean {
    if (!(error instanceof QueryFailedError)) return false;
    const driverError = error.driverError as { code?: string } | undefined;
    return driverError?.code === '23505';
  }

  private parseOptionalChapterNumber(raw: string | undefined): number | null {
    if (!raw?.trim()) {
      return null;
    }

    const parsed = Number.parseInt(raw.trim(), 10);

    if (!Number.isFinite(parsed) || parsed < 1) {
      throw new BadRequestException('chapterNumberStart must be a positive integer');
    }

    return parsed;
  }

  private async getNextChapterNumber(bookId: string): Promise<number> {
    const row = await this.chapterRepo
      .createQueryBuilder('chapter')
      .select('COALESCE(MAX(chapter.chapterNumber), 0)', 'maxChapterNumber')
      .where('chapter.bookId = :bookId', { bookId })
      .getRawOne<{ maxChapterNumber: string }>();

    return Number.parseInt(row?.maxChapterNumber ?? '0', 10) + 1;
  }

  private parsePositiveInt(
    raw: number | string | undefined,
    fallback: number,
  ): number {
    const parsed =
      typeof raw === 'number' ? raw : Number.parseInt(raw ?? '', 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
  }

  private toChapterSummary(chapter: Chapter) {
    return {
      id: chapter.id,
      bookId: chapter.bookId,
      chapterNumber: chapter.chapterNumber,
      titleOriginal: chapter.titleOriginal,
      titleTranslated: chapter.titleTranslated,
      status: chapter.status,
      totalSegments: chapter.totalSegments,
      completedSegments: chapter.completedSegments,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
      sourceFileName: chapter.sourceFileName,
      sourceFileSize: chapter.sourceFileSize,
      hasReadableContent:
        chapter.totalSegments > 0 &&
        chapter.completedSegments >= chapter.totalSegments,
    };
  }
}
