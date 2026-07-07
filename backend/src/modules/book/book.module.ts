import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Book } from '../../database/entities/book.entity';
import { Chapter } from '../../database/entities/chapter.entity';
import { Segment } from '../../database/entities/segment.entity';
import { TranslationJob } from '../../database/entities/translation-job.entity';
import { BookService } from './book.service';
import { BookController } from './book.controller';
import { QueuesModule } from '../../queue/queues.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([Book, Chapter, Segment, TranslationJob]),
    QueuesModule,
  ],
  providers: [BookService],
  controllers: [BookController],
  exports: [BookService],
})
export class BookModule {}
