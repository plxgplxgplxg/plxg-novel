import {
  Injectable,
  NotFoundException,
  ConflictException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { QueryFailedError, Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import { Segment, SegmentStatus } from '../../database/entities/segment.entity';
import { Book } from '../../database/entities/book.entity';
import { CreateChapterDto } from './dto/create-chapter.dto';
import {
  QUEUE_CHAPTER_SPLIT,
  QUEUE_TRANSLATION,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
} from '../../queue/queue.constants';

const CHAPTER_NUMBER_PATTERN = /^((第[一二三四五六七八九十百千万零两\d]+章)|Chapter\s+(\d+))/i;

@Injectable()
export class ChapterService {
  constructor(
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectQueue(QUEUE_CHAPTER_SPLIT)
    private readonly splitQueue: Queue,
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
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
  ): Promise<Chapter[]> {
    await this.assertBookOwnership(bookId, userId);

    let chapterBlocks = this.extractChaptersFromText(fileContent);

    if (chapterBlocks.length === 0) {
      const lastChapter = await this.chapterRepo.findOne({
        where: { bookId },
        order: { chapterNumber: 'DESC' },
      });

      const nextChapterNumber = lastChapter ? lastChapter.chapterNumber + 1 : 1;

      chapterBlocks = [
        {
          number: nextChapterNumber,
          title: `Chapter ${nextChapterNumber}`,
          content: fileContent.trim(),
        },
      ];
    }

    const chapters = chapterBlocks.map((block) =>
      this.chapterRepo.create({
        bookId,
        chapterNumber: block.number,
        titleOriginal: block.title,
        rawContent: block.content,
      }),
    );

    try {
      return await this.chapterRepo.save(chapters);
    } catch (error) {
      if (this.isDuplicateChapterNumberError(error)) {
        throw new ConflictException(
          'Chapter number already exists in this book. Upload files one by one or rename chapter headings.',
        );
      }
      throw error;
    }
  }

  async findOne(id: string, userId: string): Promise<Chapter> {
    const chapter = await this.chapterRepo.findOne({
      where: { id },
      relations: { book: true },
    });

    if (!chapter || chapter.book.userId !== userId) {
      throw new NotFoundException('Chapter not found');
    }

    return chapter;
  }

  async retranslateChapter(
    id: string,
    userId: string,
  ): Promise<{ jobId: string }> {
    const chapter = await this.findOne(id, userId);

    const failedSegments = await this.segmentRepo.find({
      where: { chapterId: id, status: SegmentStatus.FAILED },
    });

    if (
      failedSegments.length === 0 &&
      chapter.status !== ChapterStatus.PENDING
    ) {
      await this.splitQueue.add(
        'split-chapter',
        { chapterId: id },
        { attempts: MAX_RETRY_ATTEMPTS, backoff: BULLMQ_BACKOFF_CONFIG },
      );
      return { jobId: id };
    }

    if (failedSegments.length > 0) {
      await this.segmentRepo.update(
        failedSegments.map((s) => s.id),
        {
          status: SegmentStatus.PENDING,
          retryCount: 0,
          errorMessage: undefined,
        },
      );

      const retryJobs = failedSegments.map((seg) => ({
        name: 'translate-segment',
        data: { segmentId: seg.id, chapterId: id },
        opts: { attempts: MAX_RETRY_ATTEMPTS, backoff: BULLMQ_BACKOFF_CONFIG },
      }));

      await this.translationQueue.addBulk(retryJobs);
    }

    return { jobId: id };
  }

  private async assertBookOwnership(
    bookId: string,
    userId: string,
  ): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id: bookId, userId } });
    if (!book) throw new NotFoundException('Book not found');
  }

  private extractChaptersFromText(
    text: string,
  ): Array<{ number: number; title: string; content: string }> {
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
}
