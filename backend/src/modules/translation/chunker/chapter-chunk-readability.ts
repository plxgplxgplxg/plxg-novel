import {
  ChapterChunk,
  ChapterChunkStatus,
} from '../../../database/entities/chapter-chunk.entity';

export const buildReadableChunkContent = (chunks: ChapterChunk[]) => {
  const readableChunkCount = chunks.filter(
    (chunk) =>
      chunk.status === ChapterChunkStatus.DONE &&
      Boolean(chunk.translatedText?.trim()),
  ).length;

  const content = chunks
    .map((chunk) =>
      chunk.status === ChapterChunkStatus.DONE && chunk.translatedText?.trim()
        ? chunk.translatedText
        : chunk.sourceText,
    )
    .join('\n\n')
    .trim();

  return {
    content: chunks.length > 0 ? content : undefined,
    readableChunkCount,
  };
};

export const getFailedChunkDiagnostics = (chunks: ChapterChunk[]) =>
  chunks
    .filter((chunk) => chunk.status === ChapterChunkStatus.FAILED)
    .map((chunk) => ({
      segmentIndex: chunk.chunkIndex,
      sourceText: chunk.sourceText,
      errorMessage: chunk.errorMessage ?? null,
    }));
