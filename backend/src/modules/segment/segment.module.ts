import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Segment } from '../../database/entities/segment.entity';
import { Chapter } from '../../database/entities/chapter.entity';
import { ChapterChunk } from '../../database/entities/chapter-chunk.entity';
import { TranslationJob } from '../../database/entities/translation-job.entity';
import { SegmentService } from './segment.service';
import { SegmentController } from './segment.controller';
import { QueuesModule } from '../../queue/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Segment, Chapter, ChapterChunk]),
    TypeOrmModule.forFeature([TranslationJob]),
    QueuesModule,
  ],
  providers: [SegmentService],
  controllers: [SegmentController],
})
export class SegmentModule {}
