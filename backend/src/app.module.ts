import { Module } from '@nestjs/common';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { TypeOrmModule } from '@nestjs/typeorm';
import { EventEmitterModule } from '@nestjs/event-emitter';
import { User } from './database/entities/user.entity';
import { Book } from './database/entities/book.entity';
import { Chapter } from './database/entities/chapter.entity';
import { Segment } from './database/entities/segment.entity';
import { TranslationJob } from './database/entities/translation-job.entity';
import { AuthModule } from './modules/auth/auth.module';
import { BookModule } from './modules/book/book.module';
import { ChapterModule } from './modules/chapter/chapter.module';
import { SegmentModule } from './modules/segment/segment.module';
import { TranslationModule } from './modules/translation/translation.module';
import { ProgressModule } from './modules/progress/progress.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true }),
    EventEmitterModule.forRoot(),
    TypeOrmModule.forRootAsync({
      imports: [ConfigModule],
      inject: [ConfigService],
      useFactory: (config: ConfigService) => ({
        type: 'postgres',
        host: config.get('DB_HOST', 'localhost'),
        port: config.get<number>('DB_PORT', 5432),
        username: config.get('DB_USERNAME', 'postgres'),
        password: config.get('DB_PASSWORD', 'postgres'),
        database: config.get('DB_DATABASE', 'novel_translation'),
        entities: [User, Book, Chapter, Segment, TranslationJob],
        synchronize: config.get('NODE_ENV') !== 'production',
        logging: config.get('NODE_ENV') === 'development',
      }),
    }),
    AuthModule,
    BookModule,
    ChapterModule,
    SegmentModule,
    TranslationModule,
    ProgressModule,
  ],
})
export class AppModule {}
