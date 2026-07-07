import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Segment, SegmentStatus } from '../../database/entities/segment.entity';
import { Chapter } from '../../database/entities/chapter.entity';
import { QUEUE_TRANSLATION, BULLMQ_BACKOFF_CONFIG, MAX_RETRY_ATTEMPTS } from '../../queue/queue.constants';

@Injectable()
export class SegmentService {
  constructor(
    @InjectRepository(Segment)
    private readonly segmentRepo: Repository<Segment>,
    @InjectRepository(Chapter)
    private readonly chapterRepo: Repository<Chapter>,
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
  ) {}

  async retrySegment(id: string, userId: string): Promise<{ queued: boolean }> {
    const segment = await this.segmentRepo.findOne({
      where: { id },
      relations: { chapter: { book: true } },
    });

    if (!segment || segment.chapter.book.userId !== userId) {
      throw new NotFoundException('Segment not found');
    }

    await this.segmentRepo.update(id, {
      status: SegmentStatus.PENDING,
      retryCount: 0,
      errorMessage: undefined,
    });

    await this.translationQueue.add(
      'translate-segment',
      { segmentId: id, chapterId: segment.chapterId },
      { attempts: MAX_RETRY_ATTEMPTS, backoff: BULLMQ_BACKOFF_CONFIG },
    );

    return { queued: true };
  }
}
