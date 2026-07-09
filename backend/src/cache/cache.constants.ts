export const NOVEL_LIST_CACHE_PREFIX = 'novels:list:';
export const NOVEL_DETAIL_CACHE_PREFIX = 'novel:detail:';
export const CHAPTER_READ_CACHE_PREFIX = 'chapter:read:';
export const CHAPTER_MERGE_LOCK_PREFIX = 'lock:chapter-merge:';

export const NOVEL_LIST_TTL_SECONDS = 60;
export const NOVEL_DETAIL_TTL_SECONDS = 600;
export const CHAPTER_READ_MERGED_TTL_SECONDS = 1800;
export const CHAPTER_READ_FALLBACK_TTL_SECONDS = 120;
export const CHAPTER_MERGE_LOCK_TTL_MS = 3 * 60 * 1000;
