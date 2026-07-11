export interface TranslationChunkRequest {
  requestId: string;
  sourceLang: 'zh';
  targetLang: 'vi';
  paragraphs: Array<{ id: string; text: string }>;
  contextBefore?: string;
  glossary: Array<{
    source: string;
    target: string;
    notes?: string;
    locked: boolean;
  }>;
  profile: {
    key: string;
    version: number;
    instructions: string;
  };
}

export interface TranslationChunkResult {
  paragraphs: Array<{ id: string; text: string }>;
  rawText: string;
  model: string;
  inputTokens?: number;
  outputTokens?: number;
  finishReason?: string;
}

export interface ITranslationProvider {
  translateChunk(input: TranslationChunkRequest): Promise<TranslationChunkResult>;
}

export const TRANSLATION_PROVIDER = 'ITranslationProvider';
