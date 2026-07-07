export interface ITranslationProvider {
  translate(
    text: string,
    sourceLang: string,
    targetLang: string,
  ): Promise<string>;
  translateBatch(
    texts: string[],
    sourceLang: string,
    targetLang: string,
  ): Promise<string[]>;
}

export const TRANSLATION_PROVIDER = 'ITranslationProvider';
