import type { Env } from './errors.ts';

export const DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';
const CALL_BUDGET_MS = 25_000;
const RETRYABLE_STATUS = new Set([429, 500, 502, 503, 504]);

export type GemmaErrorCode = 'configuration' | 'auth' | 'rate_limit' | 'timeout' | 'unavailable' | 'invalid_response';

/** Only fixed messages escape this layer; provider bodies can contain private input or credentials. */
export class GemmaError extends Error {
  readonly code: GemmaErrorCode;

  constructor(code: GemmaErrorCode) {
    super(`Gemma request failed: ${code}`);
    this.name = 'GemmaError';
    this.code = code;
  }
}

type Provider = { kind: 'gemma-google' | 'gemma-ollama' | 'fallback'; model?: string };

function ollamaUrl(value: string): string | null {
  try {
    const url = new URL(value);
    if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.search || url.hash) return null;
    return `${url.toString().replace(/\/$/, '')}/api/chat`;
  } catch { return null; }
}

/** Status reports configuration, not successful model execution. Invalid configuration stays usable in fallback. */
export function aiProvider(env: Env): Provider {
  const localUrl = env.OLLAMA_URL?.trim();
  const localModel = env.OLLAMA_MODEL?.trim();
  if (localUrl && localModel) {
    return ollamaUrl(localUrl) && /^gemma-?\d[a-z0-9._:-]*$/i.test(localModel)
      ? { kind: 'gemma-ollama', model: localModel }
      : { kind: 'fallback' };
  }
  if (env.GEMINI_API_KEY?.trim()) {
    const model = env.GEMMA_MODEL?.trim() || DEFAULT_GEMMA_MODEL;
    return /^gemma-\d[a-z0-9._-]*$/i.test(model)
      ? { kind: 'gemma-google', model }
      : { kind: 'fallback' };
  }
  return { kind: 'fallback' };
}

function statusError(status: number): GemmaError {
  if (status === 401 || status === 403) return new GemmaError('auth');
  if (status === 400 || status === 404) return new GemmaError('configuration');
  if (status === 429) return new GemmaError('rate_limit');
  return new GemmaError('unavailable');
}

function retryDelay(header: string | null): number {
  if (header) {
    const seconds = Number(header);
    if (Number.isFinite(seconds) && seconds >= 0) return seconds * 1000;
    const date = Date.parse(header);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 400;
}

/** Race even response.json() against the deadline: abort alone does not bound every fetch implementation. */
function bounded<T>(operation: Promise<T>, signal: AbortSignal): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const abort = () => reject(new GemmaError('timeout'));
    if (signal.aborted) { abort(); return; }
    signal.addEventListener('abort', abort, { once: true });
    operation.then(resolve, reject).finally(() => signal.removeEventListener('abort', abort));
  });
}

function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new GemmaError('timeout')); return; }
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    const abort = () => { clearTimeout(timer); reject(new GemmaError('timeout')); };
    signal.addEventListener('abort', abort, { once: true });
  });
}

function record(value: unknown): Record<string, unknown> | null {
  return typeof value === 'object' && value !== null && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function googleText(value: unknown): string {
  const data = record(value);
  if (!data || record(data.promptFeedback)?.blockReason || !Array.isArray(data.candidates)) throw new GemmaError('invalid_response');
  for (const value of data.candidates) {
    const candidate = record(value);
    if (!candidate || candidate.finishReason !== 'STOP') continue;
    if (Array.isArray(candidate.safetyRatings) && candidate.safetyRatings.some((rating) => record(rating)?.blocked === true)) continue;
    const parts = record(candidate.content)?.parts;
    if (!Array.isArray(parts)) continue;
    const text = parts.map((value) => {
      const part = record(value);
      return part && part.thought !== true && typeof part.text === 'string' ? part.text : '';
    }).join('').trim();
    if (text) return text;
  }
  throw new GemmaError('invalid_response');
}

function localText(value: unknown): string {
  const data = record(value);
  const text = record(data?.message)?.content;
  if (data?.done !== true || (data.done_reason !== undefined && data.done_reason !== 'stop') || typeof text !== 'string' || !text.trim()) {
    throw new GemmaError('invalid_response');
  }
  return text.trim();
}

/** At most two attempts share one 25-second budget, including headers, body reading and retry waits. */
export async function generateGemma({ env, systemInstruction, userText }: {
  env: Env; systemInstruction: string; userText: string;
}): Promise<string> {
  const provider = aiProvider(env);
  if (provider.kind === 'fallback' || !provider.model) throw new GemmaError('configuration');
  const google = provider.kind === 'gemma-google';
  const gemma4 = /^gemma-4(?:-|$)/i.test(provider.model);
  const url = google
    ? `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(provider.model)}:generateContent`
    : ollamaUrl(env.OLLAMA_URL!.trim())!;
  const body = google ? {
    ...(gemma4 ? { systemInstruction: { parts: [{ text: systemInstruction }] } } : {}),
    contents: [{ role: 'user', parts: [{ text: gemma4 ? userText : `${systemInstruction}\n\n${userText}` }] }],
    generationConfig: {
      temperature: 0.1, maxOutputTokens: 1000,
      ...(gemma4 ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
    },
  } : {
    model: provider.model,
    messages: [{ role: 'system', content: systemInstruction }, { role: 'user', content: userText }],
    format: 'json', stream: false, options: { temperature: 0.1, num_predict: 1000 },
  };
  const controller = new AbortController();
  const deadline = Date.now() + CALL_BUDGET_MS;
  const timer = setTimeout(() => controller.abort(), CALL_BUDGET_MS);
  try {
    for (let attempt = 0; attempt < 2; attempt += 1) {
      if (controller.signal.aborted || Date.now() >= deadline) throw new GemmaError('timeout');
      let response: Response;
      try {
        response = await bounded(fetch(url, {
          // Workers supports manual/follow only. Refuse 3xx below instead of forwarding the API key.
          method: 'POST', redirect: 'manual',
          headers: { 'Content-Type': 'application/json', ...(google ? { 'x-goog-api-key': env.GEMINI_API_KEY!.trim() } : {}) },
          body: JSON.stringify(body), signal: controller.signal,
        }), controller.signal);
      } catch (error) {
        if (controller.signal.aborted || error instanceof GemmaError && error.code === 'timeout') throw new GemmaError('timeout');
        if (attempt === 1 || deadline - Date.now() <= 400) throw new GemmaError('unavailable');
        await pause(400, controller.signal);
        continue;
      }
      if (!response.ok) {
        // Never read or log upstream error bodies; release the connection without waiting on a stalled body.
        void response.body?.cancel().catch(() => {});
        const error = statusError(response.status);
        const delay = retryDelay(response.headers.get('retry-after'));
        if (attempt === 1 || !RETRYABLE_STATUS.has(response.status) || delay >= deadline - Date.now()) throw error;
        await pause(delay, controller.signal);
        continue;
      }
      let json: unknown;
      try { json = await bounded(response.json(), controller.signal); }
      catch (error) {
        if (controller.signal.aborted || error instanceof GemmaError && error.code === 'timeout') throw new GemmaError('timeout');
        // A disconnected response stream can fail after headers arrived; malformed JSON is never retried.
        if (error instanceof TypeError) {
          if (attempt === 1 || deadline - Date.now() <= 400) throw new GemmaError('unavailable');
          await pause(400, controller.signal);
          continue;
        }
        throw new GemmaError('invalid_response');
      }
      if (controller.signal.aborted || Date.now() >= deadline) throw new GemmaError('timeout');
      return google ? googleText(json) : localText(json);
    }
    throw new GemmaError('unavailable');
  } finally { clearTimeout(timer); }
}
