export const QUEUE_CHAPTER_SPLIT = 'chapter-split-queue';
export const QUEUE_TRANSLATION = 'translation-queue';

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

export const TRANSLATION_WORKER_CONCURRENCY = 5;
export const SPLIT_WORKER_CONCURRENCY = 2;
