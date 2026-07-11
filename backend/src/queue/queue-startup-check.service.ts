import { InjectQueue } from '@nestjs/bullmq';
import { Injectable, Logger, OnApplicationBootstrap } from '@nestjs/common';
import { Job, Queue } from 'bullmq';
import {
  QUEUE_CHAPTER_MERGE,
  QUEUE_CHAPTER_RAW_CACHE,
  QUEUE_CHAPTER_SPLIT,
  QUEUE_TRANSLATION,
} from './queue.constants';

const JOB_STATES = [
  'waiting',
  'active',
  'delayed',
  'prioritized',
  'waiting-children',
  'failed',
] as const;

@Injectable()
export class QueueStartupCheckService implements OnApplicationBootstrap {
  private readonly logger = new Logger(QueueStartupCheckService.name);

  constructor(
    @InjectQueue(QUEUE_CHAPTER_SPLIT)
    private readonly chapterSplitQueue: Queue,
    @InjectQueue(QUEUE_TRANSLATION)
    private readonly translationQueue: Queue,
    @InjectQueue(QUEUE_CHAPTER_MERGE)
    private readonly chapterMergeQueue: Queue,
    @InjectQueue(QUEUE_CHAPTER_RAW_CACHE)
    private readonly chapterRawCacheQueue: Queue,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    await Promise.all([
      this.checkQueue(this.chapterSplitQueue),
      this.checkQueue(this.translationQueue),
      this.checkQueue(this.chapterMergeQueue),
      this.checkQueue(this.chapterRawCacheQueue),
    ]);
  }

  private async checkQueue(queue: Queue): Promise<void> {
    try {
      const counts = await queue.getJobCounts(...JOB_STATES);
      const total = Object.values(counts).reduce((sum, count) => sum + count, 0);

      this.logger.log(
        `Startup queue check name=${queue.name} total=${total} counts=${JSON.stringify(
          counts,
        )}`,
      );

      if (total === 0) {
        return;
      }

      const jobs = await queue.getJobs([...JOB_STATES], 0, 9, true);
      const summary = await Promise.all(
        jobs.map(async (job) => this.summarizeJob(job)),
      );

      this.logger.log(
        `Startup queue jobs name=${queue.name} jobs=${JSON.stringify(summary)}`,
      );
    } catch (error) {
      this.logger.warn(
        `Startup queue check failed name=${queue.name} error=${String(error)}`,
      );
    }
  }

  private async summarizeJob(job: Job): Promise<{
    id?: string;
    name: string;
    state: string;
    attemptsMade: number;
    timestamp: number;
    processedOn?: number;
    failedReason?: string;
  }> {
    return {
      id: job.id,
      name: job.name,
      state: await job.getState(),
      attemptsMade: job.attemptsMade,
      timestamp: job.timestamp,
      processedOn: job.processedOn,
      failedReason: job.failedReason,
    };
  }
}
