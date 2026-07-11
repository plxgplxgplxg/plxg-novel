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

class InvalidProviderOutputError extends TranslationProviderError {
  constructor(
    message: string,
    readonly rawContent: string,
  ) {
    super(message);
    this.name = 'InvalidProviderOutputError';
  }
}

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
    let previousInvalidOutput: string | undefined;

    for (let attempt = 1; attempt <= DEFAULT_MAX_ATTEMPTS; attempt += 1) {
      try {
        return await this.translateChunkAttempt(
          input,
          attempt,
          lastError,
          previousInvalidOutput,
        );
      } catch (error) {
        lastError = error;
        if (error instanceof InvalidProviderOutputError) {
          previousInvalidOutput = error.rawContent;
        }
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
    previousInvalidOutput: string | undefined,
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
            content: this.buildSystemPrompt(
              input,
              previousError,
              previousInvalidOutput,
            ),
          },
          {
            role: 'user',
            content: JSON.stringify(
              this.buildUserPayload(input, attempt, previousInvalidOutput),
            ),
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
      throw new InvalidProviderOutputError('EMPTY_PARAGRAPHS', rawContent);
    }

    this.assertParagraphContract(input, parsed.paragraphs, rawContent);
    this.assertNoCjkInTranslation(parsed.paragraphs, rawContent);

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
    previousInvalidOutput: string | undefined,
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
      previousInvalidOutput
        ? 'Hãy dùng previousAttemptOutput làm bản nháp chính để sửa lại cho chuẩn, giữ ý và văn phong đã dịch tốt, chỉ sửa phần sai.'
        : 'Hãy trả lời lại từ đầu.',
      'Chỉ trả về JSON hợp lệ, dịch sạch toàn bộ chữ Trung sang tiếng Việt, không giữ chữ Hán/CJK trong text.',
    ].join('\n');
  }

  private buildUserPayload(
    input: TranslationChunkRequest,
    attempt: number,
    previousInvalidOutput: string | undefined,
  ): Record<string, unknown> {
    return {
      contextBefore: input.contextBefore ?? '',
      glossary: input.glossary,
      paragraphs: input.paragraphs,
      ...(attempt > 1 && previousInvalidOutput
        ? { previousAttemptOutput: previousInvalidOutput }
        : {}),
    };
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
      throw new InvalidProviderOutputError(
        `INVALID_PROVIDER_JSON:${String(error)} | Raw: ${rawContent.substring(
          0,
          500,
        )}`,
        rawContent,
      );
    }
  }

  private assertParagraphContract(
    input: TranslationChunkRequest,
    paragraphs: Array<{ id: string; text: string }>,
    rawContent: string,
  ): void {
    const expectedParagraphIds = input.paragraphs.map(
      (paragraph) => paragraph.id,
    );
    const actualParagraphIds = paragraphs.map((paragraph) => paragraph.id);

    if (expectedParagraphIds.length !== actualParagraphIds.length) {
      throw new InvalidProviderOutputError(
        `INVALID_PARAGRAPH_COUNT:expected=${expectedParagraphIds.length}:actual=${actualParagraphIds.length}`,
        rawContent,
      );
    }

    if (expectedParagraphIds.join('|') !== actualParagraphIds.join('|')) {
      throw new InvalidProviderOutputError(
        'INVALID_PARAGRAPH_ORDER',
        rawContent,
      );
    }

    const emptyParagraph = paragraphs.find(
      (paragraph) => !paragraph.text?.trim(),
    );

    if (emptyParagraph) {
      throw new InvalidProviderOutputError(
        `EMPTY_TRANSLATED_TEXT:${emptyParagraph.id}`,
        rawContent,
      );
    }
  }

  private assertNoCjkInTranslation(
    paragraphs: Array<{ id: string; text: string }>,
    rawContent: string,
  ): void {
    const leakedParagraph = paragraphs.find((paragraph) =>
      CJK_CHARACTER_PATTERN.test(paragraph.text),
    );

    if (!leakedParagraph) {
      return;
    }

    throw new InvalidProviderOutputError(
      `UNTRANSLATED_CJK:${leakedParagraph.id}`,
      rawContent,
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
      error.message.includes('EMPTY_PARAGRAPHS') ||
      error.message.includes('INVALID_PARAGRAPH_COUNT') ||
      error.message.includes('INVALID_PARAGRAPH_ORDER') ||
      error.message.includes('EMPTY_TRANSLATED_TEXT') ||
      error.message.includes('UNTRANSLATED_CJK')
    );
  }

}
