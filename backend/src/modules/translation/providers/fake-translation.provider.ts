import { Injectable } from '@nestjs/common';
import {
  ITranslationProvider,
  TranslationChunkRequest,
  TranslationChunkResult,
} from '../interfaces/translation-provider.interface';

@Injectable()
export class FakeTranslationProvider implements ITranslationProvider {
  async translateChunk(
    input: TranslationChunkRequest,
  ): Promise<TranslationChunkResult> {
    const paragraphs = input.paragraphs.map((paragraph) => ({
      id: paragraph.id,
      text: `[VI] ${paragraph.text}`,
    }));

    return {
      paragraphs,
      rawText: JSON.stringify({ paragraphs }),
      model: 'fake-translation-provider',
      inputTokens: input.paragraphs.reduce(
        (total, paragraph) => total + paragraph.text.length,
        0,
      ),
      outputTokens: paragraphs.reduce(
        (total, paragraph) => total + paragraph.text.length,
        0,
      ),
      finishReason: 'stop',
    };
  }
}
