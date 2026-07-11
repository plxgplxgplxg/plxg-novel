import { Injectable } from '@nestjs/common';
import { createHash } from 'crypto';

const TARGET_CHUNK_SIZE = 800;
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

@Injectable()
export class ChapterChunkPlanner {
  plan(rawContent: string): PlannedChunk[] {
    const paragraphs = this.extractParagraphs(rawContent);
    if (paragraphs.length === 0) {
      return [];
    }

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
        chunkLength + paragraph.text.length > TARGET_CHUNK_SIZE
      ) {
        flushChunk();
      }

      chunkParagraphs.push(paragraph);
      chunkLength += paragraph.text.length;
    }

    flushChunk();
    return chunks;
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
