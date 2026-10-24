import { afterEach, describe, expect, it, vi } from 'vitest';
import { aiProvider, DEFAULT_GEMMA_MODEL, GemmaError, generateGemma } from '../server/gemma.ts';

const input = { env: { GEMINI_API_KEY: '  test-private-key  ' }, systemInstruction: 'Extract only reported facts.', userText: 'Un gradino alto 10 cm.' };
const answer = '{"category":"steps"}';
const success = () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: answer }] } }] });
const call = () => generateGemma(input);

afterEach(() => { vi.useRealTimers(); vi.unstubAllGlobals(); });

describe('Gemma configuration and request', () => {
  it('defaults to Gemma 4, sends secrets only in the header, and bounds output', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    expect(aiProvider(input.env)).toEqual({ kind: 'gemma-google', model: DEFAULT_GEMMA_MODEL });
    expect(await call()).toBe(answer);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://generativelanguage.googleapis.com/v1beta/models/${DEFAULT_GEMMA_MODEL}:generateContent`);
    expect(url).not.toContain('key');
    expect(init.headers['x-goog-api-key']).toBe('test-private-key');
    expect(init.redirect).toBe('manual');
    const body = JSON.parse(init.body);
    expect(body.systemInstruction.parts).toEqual([{ text: input.systemInstruction }]);
    expect(body.contents[0].parts).toEqual([{ text: input.userText }]);
    expect(body.generationConfig).toEqual({ temperature: 0.1, maxOutputTokens: 1000, thinkingConfig: { thinkingLevel: 'minimal' } });
    expect(JSON.stringify(body)).not.toContain('test-private-key');
    expect(body.generationConfig).not.toHaveProperty('responseSchema');
  });

  it('supports explicit Gemma 3 without unsupported system/thinking fields', async () => {
    const fetchMock = vi.fn().mockResolvedValue(success());
    vi.stubGlobal('fetch', fetchMock);
    await generateGemma({ ...input, env: { ...input.env, GEMMA_MODEL: ' gemma-3-27b-it ' } });
    const body = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(fetchMock.mock.calls[0][0]).toContain('/gemma-3-27b-it:');
    expect(body).not.toHaveProperty('systemInstruction');
    expect(body.generationConfig).not.toHaveProperty('thinkingConfig');
    expect(body.contents[0].parts[0].text).toContain(input.systemInstruction);
  });

  it.each([
    {}, { GEMINI_API_KEY: '  ' }, { GEMINI_API_KEY: 'key', GEMMA_MODEL: 'gemini-2.5-flash' },
    { GEMINI_API_KEY: 'key', GEMMA_MODEL: 'gemma-4/../secret' },
    { OLLAMA_URL: 'file:///etc', OLLAMA_MODEL: 'gemma3' },
    { OLLAMA_URL: 'https://user:password@example.test', OLLAMA_MODEL: 'gemma3' },
    { OLLAMA_URL: 'http://localhost:11434', OLLAMA_MODEL: 'llama3' },
  ])('rejects missing or non-Gemma configuration without a request: %j', async (env) => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    expect(aiProvider(env).kind).toBe('fallback');
    await expect(generateGemma({ ...input, env })).rejects.toMatchObject({ code: 'configuration' });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('keeps Ollama priority, JSON output and a complete-response check', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ done: true, done_reason: 'stop', message: { content: answer } }));
    vi.stubGlobal('fetch', fetchMock);
    const env = { ...input.env, OLLAMA_URL: ' http://localhost:11434/ ', OLLAMA_MODEL: ' gemma3:latest ' };
    expect(aiProvider(env)).toEqual({ kind: 'gemma-ollama', model: 'gemma3:latest' });
    expect(await generateGemma({ ...input, env })).toBe(answer);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('http://localhost:11434/api/chat');
    expect(init.headers).not.toHaveProperty('x-goog-api-key');
    expect(JSON.parse(init.body)).toMatchObject({ model: 'gemma3:latest', format: 'json', stream: false });
    fetchMock.mockResolvedValue(Response.json({ done: false, message: { content: answer } }));
    await expect(generateGemma({ ...input, env })).rejects.toMatchObject({ code: 'invalid_response' });
  });
});

describe('retry and total deadline', () => {
  it.each([301, 302, 303, 307, 308])('refuses HTTP %i redirects without forwarding credentials or retrying', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status, headers: { Location: 'https://other-provider.test/' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toEqual(new GemmaError('unavailable'));
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].redirect).toBe('manual');
    expect(fetchMock.mock.calls[0][0]).toContain('https://generativelanguage.googleapis.com/');
  });

  it.each([429, 500, 502, 503, 504])('retries status %i once', async (status) => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('private provider error', { status })).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const pending = call();
    await vi.advanceTimersByTimeAsync(400);
    expect(await pending).toBe(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([[400, 'configuration'], [401, 'auth'], [403, 'auth'], [404, 'configuration'], [422, 'unavailable']])('does not retry HTTP %i', async (status, code) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('key=private or user description', { status: Number(status) }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toEqual(new GemmaError(String(code) as GemmaError['code']));
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('retries a transient network rejection once', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockRejectedValueOnce(new TypeError('network')).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const pending = call();
    await vi.advanceTimersByTimeAsync(400);
    expect(await pending).toBe(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('stops after the second retryable error and does not expose provider bodies', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(async () => new Response('SECRET-KEY-and-report', { status: 503 }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(call()).rejects.toEqual(new GemmaError('unavailable'));
    await vi.advanceTimersByTimeAsync(400);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('also retries one disconnected response stream after headers', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({ ok: true, json: async () => { throw new TypeError('connection closed'); } })
      .mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const pending = call();
    await vi.advanceTimersByTimeAsync(400);
    expect(await pending).toBe(answer);
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it('honors Retry-After seconds', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 429, headers: { 'Retry-After': '2' } })).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const pending = call();
    await vi.advanceTimersByTimeAsync(1999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(answer);
  });

  it('honors Retry-After HTTP date', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date('2026-10-24T10:00:00Z'));
    const fetchMock = vi.fn().mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': 'Sat, 24 Oct 2026 10:00:03 GMT' } })).mockResolvedValueOnce(success());
    vi.stubGlobal('fetch', fetchMock);
    const pending = call();
    await vi.advanceTimersByTimeAsync(2999);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(await pending).toBe(answer);
  });

  it('falls back immediately when Retry-After exceeds the remaining budget', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response('', { status: 429, headers: { 'Retry-After': '60' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toMatchObject({ code: 'rate_limit' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('bounds a fetch that ignores AbortSignal and aborts the underlying request', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockImplementation(() => new Promise(() => {}));
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(call()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(25_000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('includes response body reading and a retry in the same 25-second budget', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce(new Response('', { status: 503, headers: { 'Retry-After': '20' } }))
      .mockResolvedValueOnce({ ok: true, json: () => new Promise(() => {}) });
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(call()).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(25_000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('applies the same total deadline to Ollama body reads', async () => {
    vi.useFakeTimers();
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: () => new Promise(() => {}) }));
    const pending = expect(generateGemma({ ...input, env: { OLLAMA_URL: 'http://localhost:11434', OLLAMA_MODEL: 'gemma3' } })).rejects.toMatchObject({ code: 'timeout' });
    await vi.advanceTimersByTimeAsync(25_000);
    await pending;
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('response validation', () => {
  it('filters thought parts before returning the complete final answer', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [
      { text: 'Private reasoning {not an answer}', thought: true }, { text: answer },
    ] } }] })));
    expect(await call()).toBe(answer);
  });

  it.each([
    {}, null, { candidates: [] },
    { promptFeedback: { blockReason: 'SAFETY' }, candidates: [{ finishReason: 'STOP', content: { parts: [{ text: answer }] } }] },
    { candidates: [{ finishReason: 'MAX_TOKENS', content: { parts: [{ text: answer }] } }] },
    { candidates: [{ finishReason: 'SAFETY', content: { parts: [{ text: answer }] } }] },
    { candidates: [{ content: { parts: [{ text: answer }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: '  ' }] } }] },
    { candidates: [{ finishReason: 'STOP', content: { parts: [{ text: answer, thought: true }] } }] },
    { candidates: [{ finishReason: 'STOP', safetyRatings: [{ blocked: true }], content: { parts: [{ text: answer }] } }] },
  ])('rejects incomplete, blocked or empty responses without a retry: %j', async (response) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json(response));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('rejects malformed JSON without a retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('upstream HTML or truncated JSON'));
    vi.stubGlobal('fetch', fetchMock);
    await expect(call()).rejects.toMatchObject({ code: 'invalid_response' });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });
});
