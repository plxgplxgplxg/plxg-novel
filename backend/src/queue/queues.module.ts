import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { QUEUE_CHAPTER_SPLIT, QUEUE_TRANSLATION } from './queue.constants';

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
        },
      }),
    }),
    BullModule.registerQueue(
      {
        name: QUEUE_CHAPTER_SPLIT,
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
        },
      },
      {
        name: QUEUE_TRANSLATION,
        defaultJobOptions: {
          removeOnComplete: { count: 100 },
          removeOnFail: { count: 200 },
        },
      },
    ),
  ],
  exports: [BullModule],
})
export class QueuesModule {}
