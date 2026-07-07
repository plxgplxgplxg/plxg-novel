import {
  Injectable,
  NotFoundException,
  BadRequestException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Book, BookStatus } from '../../database/entities/book.entity';
import { Chapter, ChapterStatus } from '../../database/entities/chapter.entity';
import { TranslationJob, JobType, JobStatus } from '../../database/entities/translation-job.entity';
import { CreateBookDto } from './dto/create-book.dto';
import {
  QUEUE_CHAPTER_SPLIT,
  BULLMQ_BACKOFF_CONFIG,
  MAX_RETRY_ATTEMPTS,
} from '../../queue/queue.constants';

@Injectable()
export class BookService {
  constructor(
    @InjectRepository(Book)
    private readonly bookRepo: Repository<Book>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
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

  async findAllByUser(userId: string): Promise<Book[]> {
    return this.bookRepo.find({
      where: { userId },
      order: { createdAt: 'DESC' },
    });
  }

  async findOneWithChapters(id: string, userId: string): Promise<Book> {
    const book = await this.bookRepo.findOne({
      where: { id, userId },
      relations: { chapters: true },
      order: { chapters: { chapterNumber: 'ASC' } },
    });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  async getStatus(id: string, userId: string): Promise<Book> {
    const book = await this.bookRepo.findOne({
      where: { id, userId },
      relations: { chapters: true },
    });
    if (!book) throw new NotFoundException('Book not found');
    return book;
  }

  async startTranslation(id: string, userId: string): Promise<{ jobId: string }> {
    const book = await this.bookRepo.findOne({
      where: { id, userId },
      relations: { chapters: true },
    });
    if (!book) throw new NotFoundException('Book not found');

    const pendingChapters = book.chapters.filter(
      (c) => c.status === ChapterStatus.PENDING || c.status === ChapterStatus.FAILED,
    );

    if (pendingChapters.length === 0) {
      throw new BadRequestException('No chapters to translate');
    }

    const translationJob = this.jobRepo.create({
      bookId: id,
      jobType: JobType.TRANSLATE_BOOK,
      status: JobStatus.QUEUED,
    });
    const savedJob = await this.jobRepo.save(translationJob);

    await this.bookRepo.update(id, { status: BookStatus.PROCESSING });

    const splitJobs = pendingChapters.map((chapter) => ({
      name: 'split-chapter',
      data: { chapterId: chapter.id },
      opts: {
        attempts: MAX_RETRY_ATTEMPTS,
        backoff: BULLMQ_BACKOFF_CONFIG,
      },
    }));

    await this.splitQueue.addBulk(splitJobs);

    return { jobId: savedJob.id };
  }

  async softDelete(id: string, userId: string): Promise<void> {
    const book = await this.bookRepo.findOne({ where: { id, userId } });
    if (!book) throw new NotFoundException('Book not found');
    await this.bookRepo.update(id, { deletedAt: new Date() });
  }
}
