const { BaseProvider } = require('../../ai/providers/base-provider');
const { GroqProvider } = require('../../ai/providers/groq');
const { OpenAIProvider } = require('../../ai/providers/openai');
const { AnthropicProvider } = require('../../ai/providers/anthropic');
const { GeminiProvider } = require('../../ai/providers/gemini');

describe('BaseProvider', () => {
  it('stores name and apiKeys', () => {
    const provider = new BaseProvider('test', ['k1', 'k2']);
    expect(provider.name).toBe('test');
    expect(provider.apiKeys).toEqual(['k1', 'k2']);
  });

  it('rotates keys via getNextKey', () => {
    const provider = new BaseProvider('test', ['a', 'b', 'c']);
    expect(provider.getNextKey()).toBe('a');
    expect(provider.getNextKey()).toBe('b');
    expect(provider.getNextKey()).toBe('c');
    expect(provider.getNextKey()).toBe('a');
  });

  it('throws on score() call', async () => {
    const provider = new BaseProvider('test', ['k1']);
    await expect(provider.score('prompt')).rejects.toThrow('score() not implemented');
  });

  it('getNextKey works with single key', () => {
    const provider = new BaseProvider('test', ['only']);
    expect(provider.getNextKey()).toBe('only');
    expect(provider.getNextKey()).toBe('only');
  });
});

describe('GroqProvider', () => {
  it('has correct name', () => {
    const p = new GroqProvider(['k1']);
    expect(p.name).toBe('groq');
  });

  it('sends correct request and returns content', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"global_stress": 5}' } }],
      }),
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const p = new GroqProvider(['test-key']);
    const result = await p.score('test prompt', { timeout: 5000, temperature: 0.1 });

    expect(result).toBe('{"global_stress": 5}');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.groq.com/openai/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.restoreAllMocks();
  });

  it('throws on non-ok response', async () => {
    const mockResponse = {
      ok: false,
      status: 429,
      text: async () => 'Rate limit exceeded',
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const p = new GroqProvider(['test-key']);
    await expect(p.score('prompt')).rejects.toThrow('Groq 429');

    vi.restoreAllMocks();
  });
});

describe('OpenAIProvider', () => {
  it('has correct name', () => {
    const p = new OpenAIProvider(['k1']);
    expect(p.name).toBe('openai');
  });

  it('sends correct request and returns content', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        choices: [{ message: { content: '{"global_stress": 3}' } }],
      }),
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const p = new OpenAIProvider(['test-key']);
    const result = await p.score('test prompt');

    expect(result).toBe('{"global_stress": 3}');
    expect(global.fetch).toHaveBeenCalledWith(
      'https://api.openai.com/v1/chat/completions',
      expect.objectContaining({ method: 'POST' }),
    );

    vi.restoreAllMocks();
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 500,
      text: async () => 'Server Error',
    });

    const p = new OpenAIProvider(['k1']);
    await expect(p.score('prompt')).rejects.toThrow('OpenAI 500');

    vi.restoreAllMocks();
  });
});

describe('AnthropicProvider', () => {
  it('has correct name', () => {
    const p = new AnthropicProvider(['k1']);
    expect(p.name).toBe('anthropic');
  });

  it('sends correct request with x-api-key header', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        content: [{ text: '{"global_stress": 7}' }],
      }),
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const p = new AnthropicProvider(['ant-key']);
    const result = await p.score('test prompt');

    expect(result).toBe('{"global_stress": 7}');
    const fetchCall = global.fetch.mock.calls[0];
    expect(fetchCall[0]).toBe('https://api.anthropic.com/v1/messages');

    vi.restoreAllMocks();
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 401,
      text: async () => 'Unauthorized',
    });

    const p = new AnthropicProvider(['k1']);
    await expect(p.score('prompt')).rejects.toThrow('Anthropic 401');

    vi.restoreAllMocks();
  });
});

describe('GeminiProvider', () => {
  it('has correct name', () => {
    const p = new GeminiProvider(['k1']);
    expect(p.name).toBe('gemini');
  });

  it('builds correct API URL with key', () => {
    const p = new GeminiProvider(['my-key']);
    const url = p.getApiUrl('gemini-2.0-flash', 'my-key');
    expect(url).toContain('my-key');
    expect(url).toContain('gemini-2.0-flash');
  });

  it('sends correct request and returns content', async () => {
    const mockResponse = {
      ok: true,
      json: async () => ({
        candidates: [{ content: { parts: [{ text: '{"global_stress": 4}' }] } }],
      }),
    };
    vi.spyOn(global, 'fetch').mockResolvedValueOnce(mockResponse);

    const p = new GeminiProvider(['gem-key']);
    const result = await p.score('test prompt');

    expect(result).toBe('{"global_stress": 4}');

    vi.restoreAllMocks();
  });

  it('throws on non-ok response', async () => {
    vi.spyOn(global, 'fetch').mockResolvedValueOnce({
      ok: false,
      status: 403,
      text: async () => 'Forbidden',
    });

    const p = new GeminiProvider(['k1']);
    await expect(p.score('prompt')).rejects.toThrow('Gemini 403');

    vi.restoreAllMocks();
  });
});
