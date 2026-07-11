import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import {
  QUEUE_CHAPTER_MERGE,
  QUEUE_CHAPTER_RAW_CACHE,
  QUEUE_CHAPTER_SPLIT,
  QUEUE_TRANSLATION,
} from './queue.constants';
import { QueueStartupCheckService } from './queue-startup-check.service';

@Module({
  imports: [
    BullModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        connection: {
          host: config.get('REDIS_HOST', 'localhost'),
          port: config.get<number>('REDIS_PORT', 6379),
          password: config.get('REDIS_PASSWORD'),
          tls: config.get('REDIS_TLS') === 'true' ? {} : undefined,
          enableReadyCheck: false,
          maxRetriesPerRequest: null,
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_CHAPTER_SPLIT,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
      {
        name: QUEUE_TRANSLATION,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
      {
        name: QUEUE_CHAPTER_MERGE,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
      {
        name: QUEUE_CHAPTER_RAW_CACHE,
        defaultJobOptions: {
          removeOnComplete: true,
          removeOnFail: true,
        },
      },
    ),
  ],
  providers: [QueueStartupCheckService],
  exports: [BullModule],
})
export class QueuesModule {}
