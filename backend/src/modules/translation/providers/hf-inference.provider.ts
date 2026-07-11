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
const DEFAULT_MAX_ATTEMPTS = 3;
const CJK_CHARACTER_PATTERN = /[\u3400-\u9fff\uf900-\ufaff]/;
const INVALID_PARAGRAPH_IDS_PATTERN =
  /(?:UNTRANSLATED_CJK|EMPTY_TRANSLATED_TEXT):([A-Za-z0-9_,:-]+)/;

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
              this.buildUserPayload(
                input,
                attempt,
                previousError,
                previousInvalidOutput,
              ),
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
        ? 'Hãy dùng previousAttemptOutput làm bản nháp tham khảo, nhưng các paragraph trong invalidParagraphIds hoặc còn chữ Hán/CJK phải dịch lại trực tiếp từ paragraphs source, không copy lại text lỗi.'
        : 'Hãy trả lời lại từ đầu.',
      'Bắt buộc trả đủ mọi id trong paragraphs, đúng thứ tự, không thiếu đoạn, không gộp đoạn.',
      'Chỉ trả về đúng một JSON object parse được. Không markdown. Không xuống dòng literal bên trong string; nếu cần xuống dòng trong text thì dùng \\n. Escape mọi dấu nháy kép trong text.',
      'Dịch sạch toàn bộ chữ Trung sang tiếng Việt. Không được giữ bất kỳ chữ Hán/CJK nào trong text.',
    ].join('\n');
  }

  private buildUserPayload(
    input: TranslationChunkRequest,
    attempt: number,
    previousError: unknown,
    previousInvalidOutput: string | undefined,
  ): Record<string, unknown> {
    const invalidParagraphIds = this.extractInvalidParagraphIds(
      previousError,
      attempt,
    );

    return {
      contextBefore: input.contextBefore ?? '',
      glossary: input.glossary,
      paragraphs: input.paragraphs,
      ...(attempt > 1 && previousInvalidOutput
        ? {
            previousAttemptOutput: previousInvalidOutput,
            invalidParagraphIds,
            retryRules: [
              'Return every source paragraph id exactly once and in source order.',
              'For invalidParagraphIds, translate again from source paragraphs instead of copying previousAttemptOutput.',
              'No CJK characters are allowed in any text field.',
              'Return a single valid JSON object only.',
            ],
          }
        : {}),
    };
  }

  private extractInvalidParagraphIds(
    previousError: unknown,
    attempt: number,
  ): string[] {
    if (attempt <= 1 || !previousError) {
      return [];
    }

    const errorMessage =
      previousError instanceof Error ? previousError.message : String(previousError);
    const match = errorMessage.match(INVALID_PARAGRAPH_IDS_PATTERN);
    if (!match?.[1]) {
      return [];
    }

    return match[1].split(',').filter(Boolean);
  }

  private parseProviderJson(rawContent: string): {
    paragraphs?: Array<{ id: string; text: string }>;
  } {
    let jsonText = this.extractJsonText(rawContent);
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

  private extractJsonText(rawContent: string): string {
    let jsonText = rawContent.trim();
    const fenceMatch = jsonText.match(/```(?:json)?\s*([\s\S]*?)```/i);
    if (fenceMatch?.[1]) {
      jsonText = fenceMatch[1].trim();
    }

    const firstBrace = jsonText.indexOf('{');
    const lastBrace = jsonText.lastIndexOf('}');

    if (firstBrace >= 0 && lastBrace > firstBrace) {
      return jsonText.slice(firstBrace, lastBrace + 1).trim();
    }

    return jsonText;
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
    const leakedParagraphs = paragraphs.filter((paragraph) =>
      CJK_CHARACTER_PATTERN.test(paragraph.text),
    );

    if (leakedParagraphs.length === 0) {
      return;
    }

    throw new InvalidProviderOutputError(
      `UNTRANSLATED_CJK:${leakedParagraphs
        .map((paragraph) => paragraph.id)
        .join(',')}`,
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
