import { ChineseTextChunker } from './chinese-text-chunker';

describe('ChineseTextChunker', () => {
  let chunker: ChineseTextChunker;

  beforeEach(() => {
    chunker = new ChineseTextChunker();
  });

  describe('chunk', () => {
    it('splits a paragraph into segments on sentence boundaries', () => {
      const text = '这是第一句话。这是第二句话。这是第三句话。';
      const result = chunker.chunk(text);
      const nonMarkers = result.filter((s) => s !== '\n');
      expect(nonMarkers.length).toBeGreaterThan(0);
      nonMarkers.forEach((s) => expect(s.length).toBeLessThanOrEqual(120));
    });

    it('merges short sentences into a single segment up to 120 chars', () => {
      const text = '短句一。短句二。短句三。';
      const result = chunker.chunk(text);
      const nonMarkers = result.filter((s) => s !== '\n');
      expect(nonMarkers.length).toBe(1);
      expect(nonMarkers[0]).toBe('短句一。短句二。短句三。');
    });

    it('hard-splits sentences longer than 120 chars at Chinese comma', () => {
      const longSentence = '这是一个非常非常长的句子，'.repeat(6) + '结束。';
      const result = chunker.chunk(longSentence);
      const nonMarkers = result.filter((s) => s !== '\n');
      nonMarkers.forEach((s) => expect(s.length).toBeLessThanOrEqual(120));
    });

    it('inserts newline marker between paragraphs', () => {
      const text = '第一段第一句。\n\n第二段第一句。';
      const result = chunker.chunk(text);
      expect(result).toContain('\n');
    });

    it('filters empty lines', () => {
      const text = '\n\n有效内容。\n\n';
      const result = chunker.chunk(text);
      const nonMarkers = result.filter((s) => s !== '\n');
      expect(nonMarkers.length).toBe(1);
    });

    it('handles exclamation and question marks as boundaries', () => {
      const text = '你好吗！我很好！再见！';
      const result = chunker.chunk(text);
      const nonMarkers = result.filter((s) => s !== '\n');
      expect(nonMarkers.length).toBeGreaterThan(0);
    });

    it('handles text with semicolons as sentence boundaries', () => {
      const text = '条件一；条件二；条件三。';
      const result = chunker.chunk(text);
      const nonMarkers = result.filter((s) => s !== '\n');
      expect(nonMarkers.length).toBeGreaterThan(0);
    });

    it('returns only newline marker for whitespace-only input', () => {
      const result = chunker.chunk('   \n   \n   ');
      expect(result).toEqual([]);
    });

    it('skips whitespace-only fragments around valid sentences', () => {
      const text = '   第一句。   \n \n   第二句。   ';
      const result = chunker.chunk(text);
      expect(result.filter((segment) => segment.trim().length === 0 && segment !== '\n')).toEqual([]);
    });
  });
});
