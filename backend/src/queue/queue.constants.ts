export const QUEUE_CHAPTER_SPLIT = 'chapter-split-queue';
export const QUEUE_TRANSLATION = 'chapter-translation-queue';
export const QUEUE_CHAPTER_MERGE = 'chapter-merge-queue';
export const QUEUE_CHAPTER_RAW_CACHE = 'chapter-raw-cache-queue';

export const MAX_SEGMENT_LENGTH = 120;
export const MAX_RETRY_ATTEMPTS = 5;
export const MAX_FAILED_SEGMENT_PERCENT = 0.05;

export const BULLMQ_BACKOFF_CONFIG = {
  type: 'exponential' as const,
  delay: 2000,
};

export const BULLMQ_COLD_START_BACKOFF = {
  type: 'exponential' as const,
  delay: 10000,
};

export const TRANSLATION_WORKER_CONCURRENCY = 4;
export const SPLIT_WORKER_CONCURRENCY = 1;
export const MERGE_WORKER_CONCURRENCY = 2;
export const CHAPTER_ORDER_RETRY_DELAY_MS = 5000;
