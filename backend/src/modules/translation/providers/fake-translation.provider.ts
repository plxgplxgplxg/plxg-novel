import { Injectable } from '@nestjs/common';
import { ITranslationProvider } from '../interfaces/translation-provider.interface';

@Injectable()
export class FakeTranslationProvider implements ITranslationProvider {
  async translate(
    text: string,
    _sourceLang: string,
    _targetLang: string,
  ): Promise<string> {
    return `[VI] ${text}`;
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    return Promise.all(
      texts.map((t) => this.translate(t, sourceLang, targetLang)),
    );
  }
}
