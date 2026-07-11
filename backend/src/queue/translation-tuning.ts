import { ConfigService } from '@nestjs/config';
import {
  DEFAULT_BOOK_CHAPTER_CONCURRENCY,
  MAX_BOOK_CHAPTER_CONCURRENCY,
  MIN_BOOK_CHAPTER_CONCURRENCY,
} from './queue.constants';

export function resolveBookChapterConcurrency(
  configService: ConfigService,
): number {
  const configuredValue = Number.parseInt(
    configService.get<string>('TRANSLATION_CHAPTERS_PER_BOOK') ?? '',
    10,
  );

  if (Number.isNaN(configuredValue)) {
    return DEFAULT_BOOK_CHAPTER_CONCURRENCY;
  }

  return Math.min(
    MAX_BOOK_CHAPTER_CONCURRENCY,
    Math.max(MIN_BOOK_CHAPTER_CONCURRENCY, configuredValue),
  );
}
