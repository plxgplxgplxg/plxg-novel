import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { ITranslationProvider } from '../interfaces/translation-provider.interface';
import {
  EmptyTranslationError,
  ProviderColdStartError,
  TranslationProviderError,
} from '../interfaces/translation-errors';

const DEFAULT_ENDPOINT =
  'https://api-inference.huggingface.co/models/plxgplxg/nllb-zh-vi-merged';
const MAX_BATCH_SIZE = 8;

@Injectable()
export class HFInferenceProvider implements ITranslationProvider {
  constructor(private readonly configService: ConfigService) {}

  private getEndpoint(): string {
    return this.configService.get<string>('HF_ENDPOINT', DEFAULT_ENDPOINT);
  }

  async translate(
    text: string,
    _sourceLang: string,
    _targetLang: string,
  ): Promise<string> {
    const trimmedText = text.trim();
    if (!trimmedText) {
      return '';
    }

    const limitedText = trimmedText.slice(0, 120);

    const token = this.configService.get<string>('HF_TOKEN');
    const res = await fetch(this.getEndpoint(), {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        inputs: limitedText,
        parameters: { src_lang: 'zho_Hans', tgt_lang: 'vie_Latn' },
      }),
    });

    if (res.status === 503) throw new ProviderColdStartError();
    if (!res.ok) throw new TranslationProviderError(await res.text());

    const data = (await res.json()) as Array<{ translation_text: string }>;
    const result = data[0]?.translation_text?.trim();

    if (!result) throw new EmptyTranslationError();

    return result;
  }

  async translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]> {
    const results: string[] = [];

    for (let i = 0; i < texts.length; i += MAX_BATCH_SIZE) {
      const batch = texts.slice(i, i + MAX_BATCH_SIZE);
      const translated = await Promise.all(
        batch.map((text) => this.translate(text, sourceLang, targetLang)),
      );
      results.push(...translated);
    }

    return results;
  }
}
