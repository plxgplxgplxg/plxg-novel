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

const DEFAULT_ENDPOINT =
  'https://having-pharmaceuticals-chargers-transportation.trycloudflare.com/v1/chat/completions';
const DEFAULT_MODEL = 'configured-literary-translation-model';
const DEFAULT_MAX_ATTEMPTS = 2;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;

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
    let lastError: unknown;

    for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.translateChunkAttempt(input, attempt, lastError);
      } catch (error) {
        lastError = error;
        if (!this.shouldRetryProviderOutput(error, attempt)) {
          throw error;
        }

        this.logger.warn(
          `Retrying AI Provider request ${input.requestId || 'unknown'} after invalid output: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }

    throw lastError instanceof Error
      ? lastError
      : new TranslationProviderError(String(lastError));
  }

  private async translateChunkAttempt(
    input: TranslationChunkRequest,
    attempt: number,
    previousError: unknown,
  ): Promise<TranslationChunkResult> {
    const token = this.configService.get<string>('HF_TOKEN');
    const endpoint = this.getEndpoint();
    this.logger.log(
      `Calling AI Provider at ${endpoint} for request ${
        input.requestId || 'unknown'
      } attempt ${attempt}`,
    );

    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.configService.get<string>('HF_MODEL', DEFAULT_MODEL),
        temperature: 0.1,
        top_p: 0.9,
        response_format: { type: 'json_object' },
        messages: [
          {
            role: 'system',
            content: this.buildSystemPrompt(input, previousError),
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

    this.logger.log(
      `AI Provider returned status: ${res.status} for request ${
        input.requestId || 'unknown'
      } attempt ${attempt}`,
    );

    if (!res.ok) {
      const errorText = await res.text();
      this.logger.error(`AI Provider error response: ${errorText}`);
      throw new TranslationProviderError(errorText);
    }

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

    const parsed = this.parseProviderJson(rawContent);

    if (!parsed.paragraphs?.length) {
      throw new EmptyTranslationError();
    }

    this.assertNoCjkInTranslation(parsed.paragraphs);

    return {
      paragraphs: parsed.paragraphs,
      rawText: rawContent,
      model: data.model ?? DEFAULT_MODEL,
      inputTokens: data.usage?.prompt_tokens,
      outputTokens: data.usage?.completion_tokens,
      finishReason: data.choices?.[0]?.finish_reason,
      attempt,
    };
  }

  private buildSystemPrompt(
    input: TranslationChunkRequest,
    previousError: unknown,
  ): string {
    if (!previousError) {
      return input.profile.instructions;
    }

    const errorMessage =
      previousError instanceof Error ? previousError.message : String(previousError);

    return [
      input.profile.instructions,
      'Lần trả lời trước không hợp lệ.',
      `Lỗi cần sửa: ${errorMessage.substring(0, 500)}`,
      'Hãy trả lời lại từ đầu, chỉ JSON hợp lệ, dịch sạch toàn bộ chữ Trung sang tiếng Việt, không giữ chữ Hán/CJK trong text.',
    ].join('\n');
  }

  private parseProviderJson(rawContent: string): {
    paragraphs?: Array<{ id: string; text: string }>;
  } {
    let jsonText = rawContent.trim();
    if (jsonText.startsWith('```')) {
      jsonText = jsonText
        .replace(/^```(?:json)?\n?/i, '')
        .replace(/```\s*$/, '')
        .trim();
    }

    try {
      return JSON.parse(jsonText) as {
        paragraphs?: Array<{ id: string; text: string }>;
      };
    } catch (error) {
      throw new TranslationProviderError(
        `INVALID_PROVIDER_JSON:${String(error)} | Raw: ${rawContent.substring(
          0,
          500,
        )}`,
      );
    }
  }

  private assertNoCjkInTranslation(
    paragraphs: Array<{ id: string; text: string }>,
  ): void {
    const leakedParagraph = paragraphs.find((paragraph) =>
      CJK_CHARACTER_PATTERN.test(paragraph.text),
    );

    if (!leakedParagraph) {
      return;
    }

    throw new TranslationProviderError(
      `UNTRANSLATED_CJK:${leakedParagraph.id}`,
    );
  }

  private shouldRetryProviderOutput(error: unknown, attempt: number): boolean {
    if (attempt >= DEFAULT_MAX_ATTEMPTS) {
      return false;
    }

    if (error instanceof EmptyTranslationError) {
      return true;
    }

    if (!(error instanceof TranslationProviderError)) {
      return false;
    }

    return (
      error.message.includes('INVALID_PROVIDER_JSON') ||
      error.message.includes('UNTRANSLATED_CJK')
    );
  }

}
