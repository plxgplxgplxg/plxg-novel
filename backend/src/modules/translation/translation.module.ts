import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Chapter } from '../../database/entities/chapter.entity';
import { Segment } from '../../database/entities/segment.entity';
import { Book } from '../../database/entities/book.entity';
import { TranslationJob } from '../../database/entities/translation-job.entity';
import { HFInferenceProvider } from './providers/hf-inference.provider';
import { ChineseTextChunker } from './chunker/chinese-text-chunker';
import { ChapterSplitWorker } from './workers/chapter-split.worker';
import { TranslationWorker } from './workers/translation.worker';
import { TRANSLATION_PROVIDER } from './interfaces/translation-provider.interface';
import { CHUNKER } from './interfaces/chunker.interface';
import { QueuesModule } from '../../queue/queues.module';

@Module({
  imports: [
    ConfigModule,
    QueuesModule,
    TypeOrmModule.forFeature([Chapter, Segment, Book, TranslationJob]),
  ],
  providers: [
    {
      provide: TRANSLATION_PROVIDER,
      useClass: HFInferenceProvider,
    },
    {
      provide: CHUNKER,
      useClass: ChineseTextChunker,
    },
    HFInferenceProvider,
    ChineseTextChunker,
    ChapterSplitWorker,
    TranslationWorker,
  ],
  exports: [TRANSLATION_PROVIDER, CHUNKER],
})
export class TranslationModule {}
