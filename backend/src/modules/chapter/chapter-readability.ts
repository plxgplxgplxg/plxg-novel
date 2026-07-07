import { SegmentStatus } from '../../database/entities/segment.entity';

export const PARAGRAPH_MARKER = '\n';

export interface SegmentLike {
  segmentIndex: number;
  sourceText: string;
  translatedText?: string | null;
  status: SegmentStatus;
  errorMessage?: string | null;
}

export interface FailedSegmentDiagnostic {
  segmentIndex: number;
  sourceText: string;
  errorMessage: string | null;
}

export const isParagraphMarker = (sourceText: string) =>
  sourceText === PARAGRAPH_MARKER;

export const isReadableSegment = (segment: SegmentLike) =>
  !isParagraphMarker(segment.sourceText) &&
  segment.sourceText.trim().length > 0 &&
  segment.status !== SegmentStatus.FAILED;

export const buildReadableChapterContent = (segments: SegmentLike[]) => {
  const readableSegmentCount = segments.filter(isReadableSegment).length;
  const content = segments
    .map((segment) => {
      if (isParagraphMarker(segment.sourceText)) {
        return '\n\n';
      }

      if (
        segment.status === SegmentStatus.FAILED ||
        !segment.translatedText?.trim()
      ) {
        return segment.sourceText;
      }

      return segment.translatedText;
    })
    .join('');

  return {
    content: segments.length > 0 ? content : undefined,
    readableSegmentCount,
  };
};

export const getFailedSegmentDiagnostics = (
  segments: SegmentLike[],
): FailedSegmentDiagnostic[] =>
  segments
    .filter((segment) => segment.status === SegmentStatus.FAILED)
    .map((segment) => ({
      segmentIndex: segment.segmentIndex,
      sourceText: segment.sourceText,
      errorMessage: segment.errorMessage ?? null,
    }));
