import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createCloudApi } from './cloud-api.ts';
import { DEFAULT_ELEVENLABS_VOICE_ID, MAX_AUDIO_BYTES, readAudioUpload, reserveVoiceSlot, speechText, synthesizeSpeech, transcribeAudio, voiceStatus } from './elevenlabs.ts';
import { testDatabase } from './test-d1.ts';
import type { OsmDataset } from '../shared/types.ts';

const env = { ELEVENLABS_API_KEY: ' test-private-voice-key ' };
const base = 'https://accessgo.test';
// Container signatures exercise validation only; these fixtures do not claim to be playable recordings.
const webm = new Uint8Array([0x1a, 0x45, 0xdf, 0xa3, 0, 0, 0, 0]);
const mp3 = new Uint8Array([0x49, 0x44, 0x33, 0, 0, 0, 0, 0]);
const osm: OsmDataset = { source: 'OpenStreetMap', fetchedAt: '2026-10-24', bbox: [43.7, 10.3, 43.8, 10.5], features: [] };
let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => { database.sqlite.close(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
const limits = () => database.sqlite.prepare('SELECT * FROM provider_limits ORDER BY key').all();
function recording(bytes = webm, type = 'audio/webm;codecs=opus', language?: string | File) {
  const form = new FormData();
  form.set('audio', new File([bytes], 'private-original-name.webm', { type }));
  if (language !== undefined) form.set('language', language);
  return new Request(`${base}/api/voice/transcribe`, { method: 'POST', headers: { Origin: base }, body: form });
}
function speech(body: unknown = { text: 'Tra venti metri gira a destra.' }) {
  return new Request(`${base}/api/voice/speak`, { method: 'POST', headers: { Origin: base, 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
}
const audioResponse = () => new Response(mp3, { headers: { 'Content-Type': 'audio/mpeg' } });

describe('voice input boundaries', () => {
  it('reports configuration without exposing any credential or custom voice identifier', () => {
    expect(voiceStatus({})).toEqual({ provider: 'elevenlabs', configured: false, sttModel: 'scribe_v2', ttsModel: 'eleven_flash_v2_5' });
    expect(voiceStatus(env).configured).toBe(true);
    expect(JSON.stringify(voiceStatus(env))).not.toContain('private');
    expect(voiceStatus({ ...env, ELEVENLABS_VOICE_ID: '../private-voice' }).configured).toBe(false);
    expect(voiceStatus({ ...env, ELEVENLABS_TTS_MODEL: 'private-secret' })).toMatchObject({ configured: false, ttsModel: 'eleven_flash_v2_5' });
  });

  it('accepts normalized browser WebM and Safari MP4 containers and sanitizes filenames', async () => {
    expect(await readAudioUpload(recording())).toMatchObject({ type: 'audio/webm', name: 'recording.webm' });
    const mp4 = new Uint8Array([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, 0, 0, 0, 0]);
    expect(await readAudioUpload(recording(mp4, 'audio/mp4'))).toMatchObject({ type: 'audio/mp4', name: 'recording.m4a' });
  });

  it('rejects empty, unsupported, or mislabeled audio and oversized files', async () => {
    await expect(readAudioUpload(recording(new Uint8Array()))).rejects.toMatchObject({ status: 400 });
    await expect(readAudioUpload(recording(webm, 'image/png'))).rejects.toMatchObject({ status: 415 });
    await expect(readAudioUpload(recording(new TextEncoder().encode('not audio'), 'audio/webm'))).rejects.toMatchObject({ status: 415 });
    await expect(readAudioUpload(recording(new Uint8Array(MAX_AUDIO_BYTES + 1)))).rejects.toMatchObject({ status: 413 });
    const streamed = new Request(`${base}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=x' }, body: new Uint8Array(MAX_AUDIO_BYTES + 8193) });
    await expect(readAudioUpload(streamed)).rejects.toMatchObject({ status: 413 });
  });

  it('rejects URL-based, duplicate, or malformed uploads', async () => {
    for (const extra of ['audio', 'source_url', 'cloud_storage_url', 'model_id']) {
      const form = new FormData();
      form.append('audio', new File([webm], 'recording.webm', { type: 'audio/webm' }));
      form.append(extra, 'https://private.invalid/audio');
      await expect(readAudioUpload(new Request(`${base}/api/voice/transcribe`, { method: 'POST', body: form }))).rejects.toMatchObject({ status: 400 });
    }
    await expect(readAudioUpload(new Request(`${base}/api/voice/transcribe`, { method: 'POST', headers: { 'Content-Type': 'multipart/form-data; boundary=invalid' }, body: 'not multipart' }))).rejects.toMatchObject({ status: 400 });
    await expect(readAudioUpload(speech())).rejects.toMatchObject({ status: 415 });
  });

  it('rejects unsupported, oversized, duplicate, or file-valued language modes before quota and provider calls', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const language of ['en', 'zh', '', 'AUTO', ' auto', 'auto ', 'auto'.repeat(2000), new File(['auto'], 'language.txt')]) {
      await expect(transcribeAudio(recording(webm, 'audio/webm', language), env, database.db)).rejects.toMatchObject({ status: 400 });
    }
    const form = new FormData();
    form.append('audio', new File([webm], 'recording.webm', { type: 'audio/webm' }));
    form.append('language', 'auto'); form.append('language', 'it');
    await expect(transcribeAudio(new Request(`${base}/api/voice/transcribe`, { method: 'POST', body: form }), env, database.db)).rejects.toMatchObject({ status: 400 });
    expect(limits()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('requires 1–500 raw characters for speech and does not accept arbitrary provider options', () => {
    expect(speechText({ text: '  Vai dritto.  ', voice_id: 'client-override' })).toBe('Vai dritto.');
    for (const input of [null, [], {}, { text: 1 }, { text: '   ' }, { text: 'a'.repeat(501) }]) {
      expect(() => speechText(input)).toThrow();
    }
    expect(speechText({ text: 'a'.repeat(500) })).toHaveLength(500);
  });
});

describe('bounded provider requests', () => {
  it('sends STT only to ElevenLabs with fixed Italian settings and header-only secret', async () => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: '  C’è un gradino alto.  ', words: [{ ignored: true }] }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await transcribeAudio(recording(), env, database.db)).toEqual({ text: 'C’è un gradino alto.', provider: 'elevenlabs', model: 'scribe_v2' });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect(init).toMatchObject({ method: 'POST', redirect: 'manual', headers: { 'xi-api-key': 'test-private-voice-key' } });
    expect(init.headers).not.toHaveProperty('Content-Type'); // fetch supplies the real multipart boundary.
    const form = init.body as FormData;
    expect(Object.fromEntries([...form.entries()].filter(([key]) => key !== 'file'))).toEqual({ model_id: 'scribe_v2', language_code: 'ita', tag_audio_events: 'false', diarize: 'false', timestamps_granularity: 'none' });
    expect(form.get('file')).toMatchObject({ name: 'recording.webm', type: 'audio/webm' });
    expect(JSON.stringify(limits())).not.toContain('gradino');
  });

  it.each(['it', 'auto'] as const)('supports explicit %s language mode without forwarding arbitrary multipart options', async (language) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: '从火车站去比萨斜塔。', language_code: 'zho' }));
    vi.stubGlobal('fetch', fetchMock);
    expect(await transcribeAudio(recording(webm, 'audio/webm', language), env, database.db)).toEqual({
      text: '从火车站去比萨斜塔。', provider: 'elevenlabs', model: 'scribe_v2',
    });
    const form = fetchMock.mock.calls[0][1].body as FormData;
    expect(form.get('language_code')).toBe(language === 'it' ? 'ita' : null);
    expect(form.get('language')).toBeNull();
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('file')).toMatchObject({ name: 'recording.webm', type: 'audio/webm' });
    expect(Object.keys(Object.fromEntries(form.entries())).sort()).toEqual(
      (language === 'it' ? ['file', 'model_id', 'language_code', 'tag_audio_events', 'diarize', 'timestamps_granularity']
        : ['file', 'model_id', 'tag_audio_events', 'diarize', 'timestamps_granularity']).sort(),
    );
    expect(JSON.stringify(limits())).not.toContain('火车站');
  });

  it('generates actual binary speech with the fixed provider URL, selected model and Italian language', async () => {
    const fetchMock = vi.fn().mockResolvedValue(audioResponse());
    vi.stubGlobal('fetch', fetchMock);
    expect(await synthesizeSpeech({ text: ' Gira a destra. ', model_id: 'user-model' }, env, database.db)).toEqual(mp3);
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe(`https://api.elevenlabs.io/v1/text-to-speech/${DEFAULT_ELEVENLABS_VOICE_ID}?output_format=mp3_44100_128`);
    expect(init.redirect).toBe('manual');
    expect(init.headers['xi-api-key']).toBe('test-private-voice-key');
    expect(JSON.parse(init.body)).toEqual({ text: 'Gira a destra.', model_id: 'eleven_flash_v2_5', language_code: 'it' });
    expect(init.body).not.toContain('private-voice-key');
  });

  it.each([301, 302, 307, 400, 401, 403, 500])('never retries or leaks an upstream HTTP %i body', async (status) => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('private-key / user-transcript', { status, headers: { Location: 'https://other.invalid' } }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(synthesizeSpeech({ text: 'Gira a destra.' }, env, database.db)).rejects.toMatchObject({ status: 503, message: expect.not.stringMatching(/private-key|user-transcript/) });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('exposes provider throttling as a clear 429 without retry', async () => {
    const fetchMock = vi.fn().mockResolvedValue(new Response('internal quota detail', { status: 429 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(synthesizeSpeech({ text: 'Gira a destra.' }, env, database.db)).rejects.toMatchObject({ status: 429 });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { type: 'authentication_error' },
    { code: 'invalid_api_key' },
    { status: 'api_key_id_used_as_api_key' },
  ])('maps HTTP 400 authentication metadata to a safe configuration message: %j', async (detail) => {
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ detail: { ...detail, message: 'private credential and request body must not be returned' } }, { status: 400 }));
    vi.stubGlobal('fetch', fetchMock);
    await expect(synthesizeSpeech({ text: 'Gira a destra.' }, env, database.db)).rejects.toMatchObject({
      status: 503, message: 'ElevenLabs non è disponibile: controlla la configurazione e i permessi della chiave sul server.',
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('keeps unknown or oversized HTTP 400 details generic and bounded', async () => {
    vi.useFakeTimers();
    for (const detail of [{ code: 'unknown_error', message: 'private message' }, { code: 'invalid_api_key', message: 'x'.repeat(5000) }]) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ detail }, { status: 400 })));
      await expect(synthesizeSpeech({ text: 'Gira a destra.' }, env, database.db)).rejects.toMatchObject({
        status: 503, message: 'Servizio vocale ElevenLabs temporaneamente non disponibile. Riprova più tardi.',
      });
      await vi.advanceTimersByTimeAsync(501);
    }
  });

  it('bounds fetch and streamed response reading within the same 20-second deadline', async () => {
    vi.useFakeTimers();
    const fetchMock = vi.fn().mockResolvedValue(new Response(new ReadableStream({ start() {} }), { headers: { 'Content-Type': 'audio/mpeg' } }));
    vi.stubGlobal('fetch', fetchMock);
    const pending = expect(synthesizeSpeech({ text: 'Gira a destra.' }, env, database.db)).rejects.toMatchObject({ status: 504 });
    await vi.advanceTimersByTimeAsync(20_000);
    await pending;
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(fetchMock.mock.calls[0][1].signal.aborted).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
  });

  it('rejects invalid transcript JSON, silence, and excessively long transcripts', async () => {
    vi.useFakeTimers();
    for (const [response, status] of [[new Response('<html>'), 502], [Response.json({ text: ' ' }), 422], [Response.json({ text: 'a'.repeat(1001) }), 422]] as const) {
      vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));
      await expect(transcribeAudio(recording(), env, database.db)).rejects.toMatchObject({ status });
      await vi.advanceTimersByTimeAsync(5001);
    }
  });

  it('rejects error JSON disguised as successful audio', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'private details' })));
    await expect(synthesizeSpeech({ text: 'Gira a destra.' }, env, database.db)).rejects.toMatchObject({ status: 502, message: 'Audio ElevenLabs non valido.' });
  });
});

describe('shared limits and no persistence', () => {
  it('permits one concurrent request across instances and only stores global timestamps', async () => {
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveVoiceSlot(database.db, 'stt')));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    expect(limits()).toEqual([{ key: 'elevenlabs-stt-budget', next_at: expect.any(Number) }, { key: 'elevenlabs-stt-gap', next_at: expect.any(Number) }]);
  });

  it.each([['stt', 6, 5001, 60_000], ['tts', 20, 501, 30_000]] as const)('bounds the %s burst and refills gradually without a new schema', async (kind, burst, gap, refill) => {
    vi.useFakeTimers(); vi.setSystemTime(0);
    for (let i = 0; i < burst; i += 1) {
      await reserveVoiceSlot(database.db, kind);
      await vi.advanceTimersByTimeAsync(gap);
    }
    await expect(reserveVoiceSlot(database.db, kind)).rejects.toMatchObject({ status: 429 });
    vi.setSystemTime(refill);
    await expect(reserveVoiceSlot(database.db, kind)).resolves.toBeUndefined();
  });

  it('validates before quota/provider calls and fails closed on absent key or database', async () => {
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    await expect(synthesizeSpeech({ text: ' ' }, env, database.db)).rejects.toMatchObject({ status: 400 });
    await expect(synthesizeSpeech({ text: 'Gira a destra.' }, {}, database.db)).rejects.toMatchObject({ status: 503 });
    await expect(synthesizeSpeech({ text: 'Gira a destra.' }, env)).rejects.toMatchObject({ status: 503 });
    await expect(transcribeAudio(recording(new Uint8Array()), env, database.db)).rejects.toMatchObject({ status: 400 });
    expect(limits()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});

describe('voice API boundary', () => {
  it('serves anonymous status and both voice functions without identity lookup, reports, or cached audio/text', async () => {
    const getUserId = vi.fn(async () => { throw new Error('Identity must not be queried'); });
    const handler = createCloudApi({ env, db: database.db, osm, getUserId });
    const fetchMock = vi.fn().mockResolvedValueOnce(Response.json({ text: 'C’è un gradino.' })).mockResolvedValueOnce(audioResponse());
    vi.stubGlobal('fetch', fetchMock);
    const status = await handler(new Request(`${base}/api/voice/status`));
    expect(await status.json()).toMatchObject({ provider: 'elevenlabs', configured: true });
    const transcript = await handler(recording());
    expect(transcript.status).toBe(200);
    expect(transcript.headers.get('cache-control')).toBe('no-store');
    expect(await transcript.json()).toEqual({ text: 'C’è un gradino.', provider: 'elevenlabs', model: 'scribe_v2' });
    const audio = await handler(speech());
    expect(audio.status).toBe(200);
    expect(audio.headers.get('content-type')).toBe('audio/mpeg');
    expect(audio.headers.get('cache-control')).toBe('no-store');
    expect(new Uint8Array(await audio.arrayBuffer())).toEqual(mp3);
    expect(getUserId).not.toHaveBeenCalled();
    expect(database.sqlite.prepare('SELECT * FROM reports').all()).toHaveLength(0);
    expect(database.sqlite.prepare('SELECT * FROM geocode_cache').all()).toHaveLength(0);
    expect(limits().every((row) => Object.keys(row).sort().join(',') === 'key,next_at')).toBe(true);
  });

  it('requires same-origin for both POSTs, before processing audio or calling providers', async () => {
    const handler = createCloudApi({ env, db: database.db, osm, getUserId: async () => null });
    const fetchMock = vi.fn(); vi.stubGlobal('fetch', fetchMock);
    for (const build of [recording, speech]) {
      const missing = build(); missing.headers.delete('origin');
      const foreign = build(); foreign.headers.set('origin', 'https://evil.invalid');
      expect((await handler(missing)).status).toBe(403);
      expect((await handler(foreign)).status).toBe(403);
    }
    expect(limits()).toHaveLength(0);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
