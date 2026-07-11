import { ConfigService } from '@nestjs/config';
import { HFInferenceProvider } from './hf-inference.provider';

describe('HFInferenceProvider', () => {
  const originalFetch = global.fetch;

  afterEach(() => {
    global.fetch = originalFetch;
    jest.restoreAllMocks();
  });

  it('uses the first invalid output as correction context on attempt 2', async () => {
    const firstOutput = JSON.stringify({
      paragraphs: [{ id: 'p1', text: 'Vẫn còn 第一段' }],
    });
    const secondOutput = JSON.stringify({
      paragraphs: [{ id: 'p1', text: 'Doan mot' }],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          model: 'test-model',
          choices: [{ message: { content: firstOutput } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          model: 'test-model',
          choices: [{ message: { content: secondOutput } }],
        }),
      });
    global.fetch = fetchMock as never;

    const provider = new HFInferenceProvider({
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'HF_ENDPOINT') return 'https://provider.test/v1/chat';
        if (key === 'HF_MODEL') return 'test-model';
        return fallback;
      }),
    } as never as ConfigService);

    const result = await provider.translateChunk({
      requestId: 'chunk-1',
      sourceLang: 'zh',
      targetLang: 'vi',
      contextBefore: 'context',
      glossary: [],
      profile: {
        version: 'test',
        instructions: 'Translate to Vietnamese JSON.',
      },
      paragraphs: [{ id: 'p1', text: '第一段' }],
    });

    expect(result.paragraphs).toEqual([{ id: 'p1', text: 'Doan mot' }]);
    expect(result.attempt).toBe(2);
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const secondSystemPrompt = secondBody.messages[0].content;
    const secondUserPayload = JSON.parse(secondBody.messages[1].content) as {
      previousAttemptOutput?: string;
      invalidParagraphIds?: string[];
    };

    expect(secondSystemPrompt).toContain('previousAttemptOutput');
    expect(secondSystemPrompt).toContain('dịch lại trực tiếp từ paragraphs source');
    expect(secondUserPayload.previousAttemptOutput).toBe(firstOutput);
    expect(secondUserPayload.invalidParagraphIds).toEqual(['p1']);
  });

  it.each([
    [
      'invalid paragraph count',
      JSON.stringify({
        paragraphs: [{ id: 'p1', text: 'Doan mot' }],
      }),
    ],
    [
      'invalid paragraph order',
      JSON.stringify({
        paragraphs: [
          { id: 'p2', text: 'Doan hai' },
          { id: 'p1', text: 'Doan mot' },
        ],
      }),
    ],
    [
      'empty translated text',
      JSON.stringify({
        paragraphs: [
          { id: 'p1', text: 'Doan mot' },
          { id: 'p2', text: '   ' },
        ],
      }),
    ],
  ])('retries with previous output for %s', async (_name, firstOutput) => {
    const secondOutput = JSON.stringify({
      paragraphs: [
        { id: 'p1', text: 'Doan mot' },
        { id: 'p2', text: 'Doan hai' },
      ],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          model: 'test-model',
          choices: [{ message: { content: firstOutput } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          model: 'test-model',
          choices: [{ message: { content: secondOutput } }],
        }),
      });
    global.fetch = fetchMock as never;

    const provider = new HFInferenceProvider({
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'HF_ENDPOINT') return 'https://provider.test/v1/chat';
        if (key === 'HF_MODEL') return 'test-model';
        return fallback;
      }),
    } as never as ConfigService);

    const result = await provider.translateChunk({
      requestId: 'chunk-1',
      sourceLang: 'zh',
      targetLang: 'vi',
      glossary: [],
      profile: {
        version: 'test',
        instructions: 'Translate to Vietnamese JSON.',
      },
      paragraphs: [
        { id: 'p1', text: '第一段' },
        { id: 'p2', text: '第二段' },
      ],
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const secondUserPayload = JSON.parse(secondBody.messages[1].content) as {
      previousAttemptOutput?: string;
    };

    expect(result.paragraphs).toEqual([
      { id: 'p1', text: 'Doan mot' },
      { id: 'p2', text: 'Doan hai' },
    ]);
    expect(result.attempt).toBe(2);
    expect(secondUserPayload.previousAttemptOutput).toBe(firstOutput);
  });

  it('retries all paragraphs that still contain CJK and exposes their ids', async () => {
    const firstOutput = JSON.stringify({
      paragraphs: [
        { id: 'p1', text: 'Vẫn còn 第一段' },
        { id: 'p2', text: 'Vẫn còn 第二段' },
      ],
    });
    const secondOutput = JSON.stringify({
      paragraphs: [
        { id: 'p1', text: 'Doan mot' },
        { id: 'p2', text: 'Doan hai' },
      ],
    });
    const fetchMock = jest
      .fn()
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          model: 'test-model',
          choices: [{ message: { content: firstOutput } }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: jest.fn().mockResolvedValue({
          model: 'test-model',
          choices: [{ message: { content: secondOutput } }],
        }),
      });
    global.fetch = fetchMock as never;

    const provider = new HFInferenceProvider({
      get: jest.fn((key: string, fallback?: string) => {
        if (key === 'HF_ENDPOINT') return 'https://provider.test/v1/chat';
        if (key === 'HF_MODEL') return 'test-model';
        return fallback;
      }),
    } as never as ConfigService);

    await provider.translateChunk({
      requestId: 'chunk-1',
      sourceLang: 'zh',
      targetLang: 'vi',
      glossary: [],
      profile: {
        version: 'test',
        instructions: 'Translate to Vietnamese JSON.',
      },
      paragraphs: [
        { id: 'p1', text: '第一段' },
        { id: 'p2', text: '第二段' },
      ],
    });

    const secondBody = JSON.parse(fetchMock.mock.calls[1][1].body as string) as {
      messages: Array<{ role: string; content: string }>;
    };
    const secondUserPayload = JSON.parse(secondBody.messages[1].content) as {
      invalidParagraphIds?: string[];
      retryRules?: string[];
    };

    expect(secondUserPayload.invalidParagraphIds).toEqual(['p1', 'p2']);
    expect(secondUserPayload.retryRules).toEqual(
      expect.arrayContaining([
        'No CJK characters are allowed in any text field.',
      ]),
    );
  });
});
