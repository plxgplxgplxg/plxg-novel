export class TranslationProviderError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'TranslationProviderError';
  }
}

export class ProviderColdStartError extends TranslationProviderError {
  constructor() {
    super('Model is loading (cold start)');
    this.name = 'ProviderColdStartError';
  }
}

export class EmptyTranslationError extends TranslationProviderError {
  constructor() {
    super('EMPTY_TRANSLATION');
    this.name = 'EmptyTranslationError';
  }
}
