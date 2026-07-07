import { Injectable } from '@nestjs/common';
import { IChunker } from '../interfaces/chunker.interface';

const MAX_LEN = 120;
const PARAGRAPH_NEWLINE_MARKER = '\n';
const SENTENCE_BOUNDARY = /(?<=[。！？；…])/;

@Injectable()
export class ChineseTextChunker implements IChunker {
  chunk(rawText: string): string[] {
    const paragraphs = rawText.split(/\n+/).filter((p) => p.trim().length > 0);
    const segments: string[] = [];

    for (const para of paragraphs) {
      const sentences = para.split(SENTENCE_BOUNDARY).filter((s) => s.trim());
      let buffer = '';

      for (const sentence of sentences) {
        if (sentence.length > MAX_LEN) {
          if (buffer) {
            segments.push(buffer);
            buffer = '';
          }
          segments.push(...this.hardSplit(sentence));
          continue;
        }

        if ((buffer + sentence).length <= MAX_LEN) {
          buffer += sentence;
        } else {
          if (buffer) segments.push(buffer);
          buffer = sentence;
        }
      }

      if (buffer) segments.push(buffer);
      segments.push(PARAGRAPH_NEWLINE_MARKER);
    }

    return segments;
  }

  private hardSplit(sentence: string): string[] {
    const parts: string[] = [];
    let remaining = sentence;

    while (remaining.length > MAX_LEN) {
      const commaIndex = remaining.lastIndexOf('，', MAX_LEN);
      const cutAt = commaIndex > 0 ? commaIndex + 1 : MAX_LEN;
      parts.push(remaining.slice(0, cutAt));
      remaining = remaining.slice(cutAt);
    }

    if (remaining) parts.push(remaining);

    return parts;
  }
}
