import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Chapter } from '../../database/entities/chapter.entity';
import { Segment } from '../../database/entities/segment.entity';
import { Book } from '../../database/entities/book.entity';
import { TranslationJob } from '../../database/entities/translation-job.entity';
import { ChapterChunk } from '../../database/entities/chapter-chunk.entity';
import { ChapterService } from './chapter.service';
import { ChapterController } from './chapter.controller';
import { QueuesModule } from '../../queue/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([
      Chapter,
      Segment,
      ChapterChunk,
      Book,
      TranslationJob,
    ]),
    QueuesModule,
  ],
  providers: [ChapterService],
  controllers: [ChapterController],
  exports: [ChapterService],
})
export class ChapterModule {}
