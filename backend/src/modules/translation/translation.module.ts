import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { ConfigModule } from '@nestjs/config';
import { Chapter } from '../../database/entities/chapter.entity';
import { Segment } from '../../database/entities/segment.entity';
import { Book } from '../../database/entities/book.entity';
import { TranslationJob } from '../../database/entities/translation-job.entity';
import { ChapterChunk } from '../../database/entities/chapter-chunk.entity';
import { HFInferenceProvider } from './providers/hf-inference.provider';
import { ChineseTextChunker } from './chunker/chinese-text-chunker';
import { ChapterChunkPlanner } from './chunker/chapter-chunk-planner';
import { ChapterSplitWorker } from './workers/chapter-split.worker';
import { ChapterMergeWorker } from './workers/chapter-merge.worker';
import { ChapterRawCacheWorker } from './workers/chapter-raw-cache.worker';
import { TranslationWorker } from './workers/translation.worker';
import { TranslationConcurrencyService } from './translation-concurrency.service';
import { TRANSLATION_PROVIDER } from './interfaces/translation-provider.interface';
import { CHUNKER } from './interfaces/chunker.interface';
import { QueuesModule } from '../../queue/queues.module';

@Module({
  imports: [
    ConfigModule,
    QueuesModule,
    TypeOrmModule.forFeature([
      Chapter,
      Segment,
      ChapterChunk,
      Book,
      TranslationJob,
    ]),
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
    ChapterChunkPlanner,
    TranslationConcurrencyService,
    ChapterSplitWorker,
    ChapterMergeWorker,
    ChapterRawCacheWorker,
    TranslationWorker,
  ],
  exports: [TRANSLATION_PROVIDER, CHUNKER],
})
export class TranslationModule {}
