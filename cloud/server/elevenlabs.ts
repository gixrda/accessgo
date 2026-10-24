import { HttpError, type Env } from './errors.ts';

export const ELEVENLABS_STT_MODEL = 'scribe_v2';
export const DEFAULT_ELEVENLABS_TTS_MODEL = 'eleven_flash_v2_5';
// Public stock voice used in the official ElevenLabs TTS API example (George).
export const DEFAULT_ELEVENLABS_VOICE_ID = 'JBFqnCBsd6RMkjVDRZzb';
export const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const TIMEOUT_MS = 20_000;
const UNAVAILABLE = 'Servizio vocale ElevenLabs temporaneamente non disponibile. Riprova più tardi.';
const NOT_CONFIGURED = 'ElevenLabs non è configurato sul server.';
const AUTH_PROBLEM = 'ElevenLabs non è disponibile: controlla la configurazione e i permessi della chiave sul server.';
const BUSY = 'Servizio vocale momentaneamente occupato. Attendi qualche secondo e riprova.';
const MODEL_PATTERN = /^eleven_[a-z0-9_]{3,50}$/;
const VOICE_PATTERN = /^[A-Za-z0-9]{10,64}$/;

export function voiceStatus(env: Env) {
  const model = env.ELEVENLABS_TTS_MODEL?.trim() || DEFAULT_ELEVENLABS_TTS_MODEL;
  const voice = env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID;
  return {
    provider: 'elevenlabs' as const,
    configured: Boolean(env.ELEVENLABS_API_KEY?.trim()) && MODEL_PATTERN.test(model) && VOICE_PATTERN.test(voice),
    sttModel: ELEVENLABS_STT_MODEL,
    ttsModel: MODEL_PATTERN.test(model) ? model : DEFAULT_ELEVENLABS_TTS_MODEL,
  };
}

function configuration(env: Env) {
  const status = voiceStatus(env);
  if (!status.configured) throw new HttpError(503, NOT_CONFIGURED);
  return { key: env.ELEVENLABS_API_KEY!.trim(), model: status.ttsModel,
    voice: env.ELEVENLABS_VOICE_ID?.trim() || DEFAULT_ELEVENLABS_VOICE_ID };
}

/** Only timestamps are persisted: no audio, text, identity, or provider responses. */
export async function reserveVoiceSlot(db: D1Database | undefined, kind: 'stt' | 'tts'): Promise<void> {
  if (!db) throw new HttpError(503, UNAVAILABLE);
  const now = Date.now();
  const gap = kind === 'stt' ? 5_000 : 500;
  const refill = kind === 'stt' ? 60_000 : 30_000;
  const burst = kind === 'stt' ? 6 : 20;
  try {
    const fast = await db.prepare(`INSERT INTO provider_limits (key, next_at) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET next_at = excluded.next_at
      WHERE provider_limits.next_at <= ? RETURNING next_at`)
      .bind(`elevenlabs-${kind}-gap`, now + gap, now).first();
    if (!fast) throw new HttpError(429, BUSY);
    // Virtual scheduling time implements a bounded burst with gradual refill, across Worker instances.
    // Refusing a depleted budget leaves the short-gap reservation in place: fail closed, never burst.
    const budget = await db.prepare(`INSERT INTO provider_limits (key, next_at) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET next_at = MAX(provider_limits.next_at, ?) + ?
      WHERE provider_limits.next_at <= ? RETURNING next_at`)
      .bind(`elevenlabs-${kind}-budget`, now + refill, now, refill, now + refill * (burst - 1)).first();
    if (!budget) throw new HttpError(429, 'Limite temporaneo delle richieste vocali raggiunto. Attendi un minuto e riprova.');
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, UNAVAILABLE);
  }
}

async function bytesLimited(stream: ReadableStream<Uint8Array> | null, maxBytes: number, oversized: HttpError): Promise<Uint8Array> {
  if (!stream) return new Uint8Array();
  const reader = stream.getReader();
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw oversized; }
      chunks.push(value);
    }
  } finally { reader.releaseLock(); }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return bytes;
}

const starts = (data: Uint8Array, expected: number[], offset = 0) => expected.every((value, index) => data[offset + index] === value);
const ascii = (data: Uint8Array, text: string, offset = 0) => starts(data, [...text].map((char) => char.charCodeAt(0)), offset);
const mp3 = (data: Uint8Array) => ascii(data, 'ID3') || (data[0] === 0xff && (data[1] & 0xe0) === 0xe0);
const TYPES: Record<string, { extension: string; matches: (bytes: Uint8Array) => boolean }> = {
  'audio/webm': { extension: 'webm', matches: (data) => starts(data, [0x1a, 0x45, 0xdf, 0xa3]) },
  'audio/mp4': { extension: 'm4a', matches: (data) => ascii(data, 'ftyp', 4) },
  'audio/x-m4a': { extension: 'm4a', matches: (data) => ascii(data, 'ftyp', 4) },
  'audio/wav': { extension: 'wav', matches: (data) => ascii(data, 'RIFF') && ascii(data, 'WAVE', 8) },
  'audio/x-wav': { extension: 'wav', matches: (data) => ascii(data, 'RIFF') && ascii(data, 'WAVE', 8) },
  'audio/ogg': { extension: 'ogg', matches: (data) => ascii(data, 'OggS') },
  'audio/mpeg': { extension: 'mp3', matches: mp3 },
  'audio/mp3': { extension: 'mp3', matches: mp3 },
  'audio/flac': { extension: 'flac', matches: (data) => ascii(data, 'fLaC') },
};

/** Bounded multipart parsing; URLs and arbitrary additional provider options are never accepted. */
export async function readAudioUpload(request: Request): Promise<File> {
  const contentType = request.headers.get('content-type') ?? '';
  if (!/^multipart\/form-data\s*;/i.test(contentType)) throw new HttpError(415, 'Invia una registrazione audio in formato multipart.');
  const limit = MAX_AUDIO_BYTES + 8192;
  if (Number(request.headers.get('content-length')) > limit) throw new HttpError(413, 'Audio troppo grande: massimo 2 MB.');
  const bytes = await bytesLimited(request.body, limit, new HttpError(413, 'Audio troppo grande: massimo 2 MB.'));
  let form: FormData;
  try { form = await new Response(bytes as BodyInit, { headers: { 'Content-Type': contentType } }).formData(); }
  catch { throw new HttpError(400, 'Registrazione audio non valida.'); }
  const entries = [...form.entries()];
  if (entries.length !== 1 || entries[0][0] !== 'audio' || !(entries[0][1] instanceof File)) {
    throw new HttpError(400, 'Invia un solo file audio; indirizzi web e altri campi non sono accettati.');
  }
  const file = entries[0][1];
  if (!file.size) throw new HttpError(400, 'La registrazione è vuota.');
  if (file.size > MAX_AUDIO_BYTES) throw new HttpError(413, 'Audio troppo grande: massimo 2 MB.');
  const type = file.type.split(';')[0].trim().toLowerCase();
  const format = TYPES[type];
  const head = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (!format || !format.matches(head)) throw new HttpError(415, 'Formato audio non supportato o file non valido. Registra di nuovo.');
  // Do not forward arbitrary user filenames or metadata to the speech provider.
  return new File([file], `recording.${format.extension}`, { type });
}

export function speechText(input: unknown): string {
  const text = input && typeof input === 'object' && !Array.isArray(input) ? (input as Record<string, unknown>).text : undefined;
  if (typeof text !== 'string' || !text.trim()) throw new HttpError(400, 'Scrivi il testo da leggere.');
  if (text.length > 500) throw new HttpError(400, 'La lettura vocale può avere al massimo 500 caratteri.');
  return text.trim();
}

/** Inspect only bounded error codes; provider messages, credentials and request details never escape. */
async function isAuthenticationError(response: Response): Promise<boolean> {
  try {
    const bytes = await bytesLimited(response.body, 4096, new HttpError(503, UNAVAILABLE));
    const value: unknown = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const detail = (value as { detail?: unknown }).detail;
    if (!detail || typeof detail !== 'object' || Array.isArray(detail)) return false;
    const { type, code, status } = detail as Record<string, unknown>;
    return type === 'authentication_error'
      || [code, status].some((field) => field === 'invalid_api_key' || field === 'api_key_id_used_as_api_key');
  } catch { return false; }
}

/** No retries: avoid duplicating chargeable speech requests after an uncertain network outcome. */
async function providerCall<T>(url: string, init: RequestInit, decode: (response: Response) => Promise<T>): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout>;
  const timeout = new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => { controller.abort(); reject(new HttpError(504, 'ElevenLabs ha impiegato troppo tempo. Riprova.')); }, TIMEOUT_MS);
  });
  try {
    return await Promise.race([timeout, (async () => {
      const response = await fetch(url, { ...init, signal: controller.signal, redirect: 'manual' });
      if (!response.ok) {
        const invalidKey = response.status === 400 && await isAuthenticationError(response);
        if (response.status !== 400) void response.body?.cancel().catch(() => {});
        if (response.status === 429) throw new HttpError(429, BUSY);
        if (invalidKey || response.status === 401 || response.status === 403) throw new HttpError(503, AUTH_PROBLEM);
        throw new HttpError(503, UNAVAILABLE);
      }
      return decode(response);
    })()]);
  } catch (error) {
    if (error instanceof HttpError) throw error;
    throw new HttpError(503, UNAVAILABLE);
  } finally { clearTimeout(timer!); }
}

export async function transcribeAudio(request: Request, env: Env, db?: D1Database) {
  const file = await readAudioUpload(request);
  const config = configuration(env);
  await reserveVoiceSlot(db, 'stt');
  const form = new FormData();
  form.set('file', file);
  form.set('model_id', ELEVENLABS_STT_MODEL);
  form.set('language_code', 'ita');
  form.set('tag_audio_events', 'false');
  form.set('diarize', 'false');
  form.set('timestamps_granularity', 'none');
  return providerCall('https://api.elevenlabs.io/v1/speech-to-text', {
    method: 'POST', headers: { 'xi-api-key': config.key }, body: form,
  }, async (response) => {
    const bytes = await bytesLimited(response.body, 128 * 1024, new HttpError(502, 'Risposta vocale non valida.'));
    let value: unknown;
    try { value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
    catch { throw new HttpError(502, 'Risposta vocale non valida.'); }
    const text = value && typeof value === 'object' && !Array.isArray(value) ? (value as { text?: unknown }).text : undefined;
    if (typeof text !== 'string' || !text.trim()) throw new HttpError(422, 'Nessuna parola riconosciuta. Registra di nuovo oppure scrivi il testo.');
    if (text.length > 1000) throw new HttpError(422, 'Trascrizione troppo lunga. Registra un messaggio più breve.');
    return { text: text.trim(), provider: 'elevenlabs' as const, model: ELEVENLABS_STT_MODEL };
  });
}

export async function synthesizeSpeech(input: unknown, env: Env, db?: D1Database): Promise<Uint8Array> {
  const text = speechText(input);
  const config = configuration(env);
  await reserveVoiceSlot(db, 'tts');
  return providerCall(`https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(config.voice)}?output_format=mp3_44100_128`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'xi-api-key': config.key, Accept: 'audio/mpeg' },
    body: JSON.stringify({ text, model_id: config.model, language_code: 'it' }),
  }, async (response) => {
    if (!/^audio\/(?:mpeg|mp3)(?:;|$)/i.test(response.headers.get('content-type') ?? '')) throw new HttpError(502, 'Audio ElevenLabs non valido.');
    const bytes = await bytesLimited(response.body, MAX_AUDIO_BYTES, new HttpError(502, 'Audio ElevenLabs troppo grande.'));
    if (!mp3(bytes)) throw new HttpError(502, 'Audio ElevenLabs non valido.');
    return bytes;
  });
}
