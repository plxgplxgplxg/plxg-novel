export interface IChunker {
  chunk(rawText: string): string[];
}

export const CHUNKER = 'IChunker';
