import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  CHAPTER_READ_CACHE_PREFIX,
  NOVEL_DETAIL_CACHE_PREFIX,
  NOVEL_LIST_CACHE_PREFIX,
} from './cache.constants';
import { RedisCacheService } from './redis-cache.service';

@Injectable()
export class NovelCacheService {
  constructor(private readonly redisCacheService: RedisCacheService) {}

  buildNovelListKey(
    filters: Record<string, unknown>,
    pageOrCursor: number | string,
  ): string {
    const filtersHash = this.hashObject(filters);
    return `${NOVEL_LIST_CACHE_PREFIX}${filtersHash}:page:${pageOrCursor}`;
  }

  buildNovelDetailKey(bookIdOrSlug: string, scope: string): string {
    return `${NOVEL_DETAIL_CACHE_PREFIX}${bookIdOrSlug}:${scope}`;
  }

  buildChapterReadKey(
    chapterId: string,
    mergeVersion: number,
    scope: string,
  ): string {
    return `${CHAPTER_READ_CACHE_PREFIX}${chapterId}:v${mergeVersion}:${scope}`;
  }

  async invalidateNovelLists(): Promise<void> {
    await this.redisCacheService.deleteByPrefix(NOVEL_LIST_CACHE_PREFIX);
  }

  async invalidateNovelDetail(bookIdOrSlug: string): Promise<void> {
    await this.redisCacheService.deleteByPrefix(
      `${NOVEL_DETAIL_CACHE_PREFIX}${bookIdOrSlug}`,
    );
  }

  async invalidateChapterRead(chapterId: string): Promise<void> {
    await this.redisCacheService.deleteByPrefix(
      `${CHAPTER_READ_CACHE_PREFIX}${chapterId}:`,
    );
  }

  async invalidateBookAndChapterCaches(
    bookId: string,
    chapterId?: string,
  ): Promise<void> {
    await Promise.all([
      this.invalidateNovelLists(),
      this.invalidateNovelDetail(bookId),
      chapterId ? this.invalidateChapterRead(chapterId) : Promise.resolve(),
    ]);
  }

  hashObject(value: Record<string, unknown>): string {
    return createHash('sha1')
      .update(JSON.stringify(value))
      .digest('hex');
  }
}
