import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ITranslationProvider,
  TranslationChunkRequest,
  TranslationChunkResult,
} from '../interfaces/translation-provider.interface';
import {
  EmptyTranslationError,
  ProviderColdStartError,
  TranslationProviderError,
} from '../interfaces/translation-errors';

const DEFAULT_ENDPOINT = 'https://bubble-reactive-framing.ngrok-free.dev/v1/chat/completions';
const DEFAULT_MODEL = 'configured-literary-translation-model';

@Injectable()
export class HFInferenceProvider implements ITranslationProvider {
  constructor(private readonly configService: ConfigService) {}

  private getEndpoint(): string {
    return this.configService.get<string>('HF_ENDPOINT', DEFAULT_ENDPOINT);
  }

  async translateChunk(
    input: TranslationChunkRequest,
  ): Promise<TranslationChunkResult> {
    const token = this.configService.get<string>('HF_TOKEN');
    const res = await fetch(this.getEndpoint(), {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.configService.get<string>('HF_MODEL', DEFAULT_MODEL),
        temperature: 0.2,
        messages: [
          {
            role: 'system',
            content: input.profile.instructions,
          },
          {
            role: 'user',
            content: JSON.stringify({
              contextBefore: input.contextBefore ?? '',
              glossary: input.glossary,
              paragraphs: input.paragraphs,
            }),
          },
        ],
      }),
    });

    if (res.status === 503) throw new ProviderColdStartError();
    if (!res.ok) throw new TranslationProviderError(await res.text());

    const data = (await res.json()) as {
      model?: string;
      usage?: {
        prompt_tokens?: number;
        completion_tokens?: number;
      };
      choices?: Array<{
        finish_reason?: string;
        message?: {
          content?: string;
        };
      }>;
    };
    const rawContent = data.choices?.[0]?.message?.content?.trim();

    if (!rawContent) {
      throw new EmptyTranslationError();
    }

    let parsed: { paragraphs?: Array<{ id: string; text: string }> };
    try {
      parsed = JSON.parse(rawContent) as {
        paragraphs?: Array<{ id: string; text: string }>;
      };
    } catch (error) {
      throw new TranslationProviderError(
        `INVALID_PROVIDER_JSON:${String(error)}`,
      );
    }

    if (!parsed.paragraphs?.length) {
      throw new EmptyTranslationError();
    }

    return {
      paragraphs: parsed.paragraphs,
      rawText: rawContent,
      model: data.model ?? DEFAULT_MODEL,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      finishReason: data.choices?.[0]?.finish_reason,
    };
  }
}
