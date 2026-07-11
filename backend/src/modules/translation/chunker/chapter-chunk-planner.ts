import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';
import {
  DEFAULT_TRANSLATION_CHUNK_SIZE,
  MAX_TRANSLATION_CHUNK_SIZE,
  MIN_TRANSLATION_CHUNK_SIZE,
} from '../../../queue/queue.constants';

const CONTEXT_TAIL_LENGTH = 280;

export interface PlannedParagraph {
  id: string;
  text: string;
}

export interface PlannedChunk {
  chunkIndex: number;
  sourceText: string;
  contextBefore: string;
  paragraphIds: string[];
  paragraphs: PlannedParagraph[];
  sourceHash: string;
}

export interface ChapterChunkPlannerOptions {
  targetChunkSize?: number;
}

@Injectable()
export class ChapterChunkPlanner {
  plan(
    rawContent: string,
    options: ChapterChunkPlannerOptions = {},
  ): PlannedChunk[] {
    const paragraphs = this.extractParagraphs(rawContent);
    if (paragraphs.length === 0) {
      return [];
    }

    const targetChunkSize = this.normalizeTargetChunkSize(
      options.targetChunkSize,
    );
    const chunks: PlannedChunk[] = [];
    let chunkParagraphs: PlannedParagraph[] = [];
    let chunkLength = 0;

    const flushChunk = () => {
      if (chunkParagraphs.length === 0) {
        return;
      }

      const sourceText = chunkParagraphs
        .map((paragraph) => paragraph.text)
        .join('\n\n');
      const previousText = chunks[chunks.length - 1]?.sourceText ?? '';
      const contextBefore = previousText.slice(-CONTEXT_TAIL_LENGTH);

      chunks.push({
        chunkIndex: chunks.length,
        sourceText,
        contextBefore,
        paragraphIds: chunkParagraphs.map((paragraph) => paragraph.id),
        paragraphs: [...chunkParagraphs],
        sourceHash: createHash('sha256').update(sourceText).digest('hex'),
      });

      chunkParagraphs = [];
      chunkLength = 0;
    };

    for (const paragraph of paragraphs) {
      if (
        chunkParagraphs.length > 0 &&
        chunkLength + paragraph.text.length > targetChunkSize
      ) {
        flushChunk();
      }

      chunkParagraphs.push(paragraph);
      chunkLength += paragraph.text.length;
    }

    flushChunk();
    return chunks;
  }

  private normalizeTargetChunkSize(value: number | undefined): number {
    if (!value || Number.isNaN(value)) {
      return DEFAULT_TRANSLATION_CHUNK_SIZE;
    }

    return Math.min(
      MAX_TRANSLATION_CHUNK_SIZE,
      Math.max(MIN_TRANSLATION_CHUNK_SIZE, value),
    );
  }

  private extractParagraphs(rawContent: string): PlannedParagraph[] {
    return rawContent
      .split(/\n{2,}/)
      .map((paragraph) => paragraph.trim())
      .filter((paragraph) => paragraph.length > 0)
      .map((paragraph, index) => ({
        id: `p${String(index + 1).padStart(4, '0')}`,
        text: paragraph,
      }));
  }
}
