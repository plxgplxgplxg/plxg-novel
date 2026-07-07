import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository, SelectQueryBuilder } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import { Segment } from '../../database/entities/segment.entity';
import { Book, BookStatus } from '../../database/entities/book.entity';
import {
  TranslationJob,
  JobStatus,
  JobType,
} from '../../database/entities/translation-job.entity';
import { CreateChapterDto } from './dto/create-chapter.dto';
import { ListBookChaptersDto } from './dto/list-book-chapters.dto';
import {
  QUEUE_CHAPTER_SPLIT,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
} from '../../queue/queue.constants';

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

@Injectable()
export class ChapterService {
  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(TranslationJob)
    private readonly jobRepo: Repository<TranslationJob>,
    @InjectQueue(QUEUE_CHAPTER_SPLIT)
    private readonly splitQueue: Queue,
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

    return this.chapterRepo.save(chapter);
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
      this.parsePositiveInt(query.page, DEFAULT_PAGE_SIZE),
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
    const chapter = await this.chapterRepo.findOne({
      where: { id },
      relations: { book: true },
    });

    if (!chapter) {
      throw new NotFoundException('Chapter not found');
    }

    const canManage = userId === chapter.book.userId;

    if (!canManage && chapter.status !== ChapterStatus.DONE) {
      throw new ForbiddenException('Chapter is not ready to read');
    }

    return {
      id: chapter.id,
      bookId: chapter.bookId,
      chapterNumber: chapter.chapterNumber,
      titleOriginal: chapter.titleOriginal,
      titleTranslated: chapter.titleTranslated,
      status: chapter.status,
      totalSegments: chapter.totalSegments,
      completedSegments: chapter.completedSegments,
      translatedContent: chapter.translatedContent,
      createdAt: chapter.createdAt,
      updatedAt: chapter.updatedAt,
      sourceFileName: chapter.sourceFileName,
      sourceFileSize: chapter.sourceFileSize,
      canManage,
    };
  }

  async retranslateChapter(
    id: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    const chapter = await this.findChapterForOwner(id, userId);
    await this.segmentRepo.delete({ chapterId: id });
    await this.chapterRepo.update(id, {
      status: ChapterStatus.PENDING,
      totalSegments: 0,
      completedSegments: 0,
      translatedContent: undefined,
    });

    const jobId = await this.enqueueChaptersForTranslation(chapter.bookId, [chapter]);
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

    await this.segmentRepo.delete({ chapterId: chapter.id });
    await this.jobRepo.delete({ chapterId: chapter.id });
    await this.chapterRepo.update(chapter.id, {
      titleOriginal: replacementBlock.title,
      rawContent: replacementBlock.content,
      sourceFileName: sourceMetadata.sourceFileName,
      sourceFileSize: sourceMetadata.sourceFileSize,
      status: ChapterStatus.PENDING,
      totalSegments: 0,
      completedSegments: 0,
      translatedContent: undefined,
      titleTranslated: undefined,
    });

    const refreshedChapter = await this.chapterRepo.findOne({
      where: { id: chapter.id },
    });

    if (!refreshedChapter) {
      throw new NotFoundException('Chapter not found');
    }

    const jobId = await this.enqueueChaptersForTranslation(chapter.bookId, [
      refreshedChapter,
    ]);

    return {
      chapter: this.toChapterSummary(refreshedChapter),
      jobId,
    };
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
  ): Promise<string> {
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

    return bookJob.id;
  }

  private extractChaptersFromText(
    text: string,
  ): ParsedChapterBlock[] {
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
    };
  }
}
