import { createHash } from 'crypto';
import { Segment } from '../../database/entities/segment.entity';
import {
  buildReadableChapterContent,
  getFailedSegmentDiagnostics,
} from './chapter-readability';

export interface ChapterMergePayload {
  content: string;
  readableSegmentCount: number;
  failedSegmentCount: number;
  failedSegments: Array<{
    segmentIndex: number;
    sourceText: string;
    errorMessage: string | null;
  }>;
  segmentsHash: string;
}

export const buildChapterMergePayload = (
  segments: Segment[],
): ChapterMergePayload => {
  const failedSegments = getFailedSegmentDiagnostics(segments);
  const { content, readableSegmentCount } = buildReadableChapterContent(segments);

  return {
    content: content ?? '',
    readableSegmentCount,
    failedSegmentCount: failedSegments.length,
    failedSegments,
    segmentsHash: createHash('sha256')
      .update(
        JSON.stringify(
          segments.map((segment) => ({
            id: segment.id,
            index: segment.segmentIndex,
            status: segment.status,
            sourceText: segment.sourceText,
            translatedText: segment.translatedText ?? '',
            updatedAt: segment.updatedAt?.toISOString() ?? '',
          })),
        ),
      )
      .digest('hex'),
  };
};
