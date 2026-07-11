import { Injectable, Logger } from '@nestjs/common';
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

const DEFAULT_ENDPOINT = 'https://having-pharmaceuticals-chargers-transportation.trycloudflare.com/v1/chat/completions';
const DEFAULT_MODEL = 'configured-literary-translation-model';

@Injectable()
export class HFInferenceProvider implements ITranslationProvider {
  private readonly logger = new Logger(HFInferenceProvider.name);

  constructor(private readonly configService: ConfigService) {}

  private getEndpoint(): string {
    return this.configService.get<string>('HF_ENDPOINT', DEFAULT_ENDPOINT);
  }

  async translateChunk(
    input: TranslationChunkRequest,
  ): Promise<TranslationChunkResult> {
    const token = this.configService.get<string>('HF_TOKEN');
    const endpoint = this.getEndpoint();
    this.logger.log(`Calling AI Provider at ${endpoint} for request ${input.requestId || 'unknown'}`);

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.configService.get<string>('HF_MODEL', DEFAULT_MODEL),
        temperature: 0.2,
        max_tokens: 4096,
        response_format: { type: 'json_object' },
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

    this.logger.log(`AI Provider returned status: ${res.status}`);

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

    let jsonText = rawContent;
    if (jsonText.startsWith('```')) {
      jsonText = jsonText.replace(/^```(?:json)?\n?/i, '').replace(/```\s*$/, '').trim();
    }

    let parsed: { paragraphs?: Array<{ id: string; text: string }> };
    try {
      parsed = JSON.parse(jsonText) as {
        paragraphs?: Array<{ id: string; text: string }>;
      };
    } catch (error) {
      throw new TranslationProviderError(
        `INVALID_PROVIDER_JSON:${String(error)} | Raw: ${rawContent.substring(0, 500)}`,
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
