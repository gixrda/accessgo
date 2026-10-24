import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngTuple } from '../shared/types.ts';
import { osrmManeuvers } from '../server/routing.ts';
import { reserveVoiceSlot, resetVoiceLimits, speechText, synthesizeSpeech, transcribeAudio, voiceStatus } from '../server/voice.ts';
import { distanceInstruction, usableManeuvers } from '../src/lib/navigation.ts';

const ENV = { ELEVENLABS_API_KEY: 'k' };
const wavBytes = () => { const b = new Uint8Array(64); b.set([82, 73, 70, 70], 0); b.set([87, 65, 86, 69], 8); return b; };

function upload(fields: Record<string, Blob | string>): Request {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) { if (v instanceof Blob) form.append(k, v, 'a.wav'); else form.append(k, v); }
  return new Request('http://localhost/api/voice/transcribe', { method: 'POST', body: form });
}

beforeEach(() => resetVoiceLimits());
afterEach(() => vi.unstubAllGlobals());

describe('voiceStatus / speechText', () => {
  it('è configurato solo con la chiave', () => {
    expect(voiceStatus({})).toMatchObject({ provider: 'elevenlabs', configured: false, sttModel: 'scribe_v2' });
    expect(voiceStatus(ENV)).toMatchObject({ configured: true, ttsModel: 'eleven_flash_v2_5' });
    expect(voiceStatus({ ...ENV, ELEVENLABS_TTS_MODEL: 'non valido' }).configured).toBe(false);
  });

  it('valida il testo da leggere', () => {
    expect(speechText({ text: ' Ciao ' })).toBe('Ciao');
    expect(() => speechText({ text: '' })).toThrow(/Scrivi il testo/);
    expect(() => speechText({ text: 'x'.repeat(501) })).toThrow(/500 caratteri/);
    expect(() => speechText('Ciao')).toThrow();
  });
});

describe('transcribeAudio', () => {
  it('invia il file a ElevenLabs e restituisce il testo', async () => {
    const fetchMock = vi.fn(async () => Response.json({ text: ' Portami in Piazza dei Cavalieri ', language_code: 'ita' }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await transcribeAudio(upload({ audio: new Blob([wavBytes()], { type: 'audio/wav' }) }), ENV);
    expect(r).toEqual({ text: 'Portami in Piazza dei Cavalieri', provider: 'elevenlabs', model: 'scribe_v2' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/speech-to-text');
    expect((init.headers as Record<string, string>)['xi-api-key']).toBe('k');
    const form = init.body as FormData;
    expect(form.get('model_id')).toBe('scribe_v2');
    expect(form.get('language_code')).toBe('ita');
    expect((form.get('file') as File).name).toBe('recording.wav');
  });

  it('rifiuta richieste non valide senza chiamare il servizio', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);
    await expect(transcribeAudio(new Request('http://x', { method: 'POST', body: '{}', headers: { 'content-type': 'application/json' } }), ENV)).rejects.toMatchObject({ status: 415 });
    await expect(transcribeAudio(upload({ audio: new Blob([new Uint8Array(40)], { type: 'audio/wav' }) }), ENV)).rejects.toMatchObject({ status: 415 }); // non è un WAV
    await expect(transcribeAudio(upload({ audio: new Blob([wavBytes()], { type: 'audio/wav' }), url: 'http://evil' }), ENV)).rejects.toMatchObject({ status: 400 });
    await expect(transcribeAudio(upload({ audio: new Blob([wavBytes()], { type: 'audio/wav' }) }), {})).rejects.toMatchObject({ status: 503 });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('nessuna parola riconosciuta → 422; chiave rifiutata → messaggio di configurazione', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ text: '   ' })));
    await expect(transcribeAudio(upload({ audio: new Blob([wavBytes()], { type: 'audio/wav' }) }), ENV)).rejects.toMatchObject({ status: 422 });
    resetVoiceLimits();
    vi.stubGlobal('fetch', vi.fn(async () => new Response('{"detail":{"status":"missing_permissions"}}', { status: 401 })));
    await expect(transcribeAudio(upload({ audio: new Blob([wavBytes()], { type: 'audio/wav' }) }), ENV)).rejects.toMatchObject({ status: 503, message: expect.stringMatching(/permessi della chiave/) });
  });
});

describe('synthesizeSpeech', () => {
  const mp3 = () => new Response(new Uint8Array([0x49, 0x44, 0x33, 4, 0, 0, 0, 0, 0, 0]), { headers: { 'content-type': 'audio/mpeg' } });

  it('chiede l\'audio italiano in mp3 e lo restituisce', async () => {
    const fetchMock = vi.fn(async () => mp3());
    vi.stubGlobal('fetch', fetchMock);
    const audio = await synthesizeSpeech({ text: 'Tra trenta metri svolta a destra' }, { ...ENV, ELEVENLABS_VOICE_ID: 'VoceDiProva12' });
    expect(audio.byteLength).toBe(10);
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.elevenlabs.io/v1/text-to-speech/VoceDiProva12?output_format=mp3_44100_128');
    expect(JSON.parse(init.body as string)).toEqual({ text: 'Tra trenta metri svolta a destra', model_id: 'eleven_flash_v2_5', language_code: 'it' });
  });

  it('una risposta che non è audio non viene riprodotta', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ oops: true })));
    await expect(synthesizeSpeech({ text: 'Ciao' }, ENV)).rejects.toMatchObject({ status: 502 });
  });

  it('limita le richieste ravvicinate', async () => {
    await reserveVoiceSlot('stt');
    await expect(reserveVoiceSlot('stt')).rejects.toMatchObject({ status: 429 });
    await reserveVoiceSlot('tts'); // limiti separati per tipo
  });
});

describe('istruzioni di svolta', () => {
  const coords: LatLngTuple[] = [[43.7160, 10.4000], [43.7160, 10.4010], [43.7170, 10.4010]];
  const step = (i: number, instruction: string, distance: number, type = 'turn') => ({
    distance, maneuver: { instruction, type, location: [coords[i][1], coords[i][0]] }, intersections: [{ geometry_index: i }],
  });
  const route = { distance: 190, duration: 180, geometry: { coordinates: coords.map(([a, b]) => [b, a] as [number, number]) } };

  it('aggancia ogni istruzione alla geometria con la distanza dalla partenza', () => {
    const m = osrmManeuvers({ ...route, legs: [{ steps: [step(0, 'Cammina verso est su Via Trento.', 80), step(1, 'Svolta a sinistra.', 110), step(2, 'Sei arrivato.', 0, 'arrive')] }] }, coords);
    // distanze lungo la geometria (haversine), arrotondate alla decina
    expect(m.map((x) => [x.instruction, x.shapeIndex, Math.round(x.routeDistanceM / 10) * 10])).toEqual([
      ['Cammina verso est su Via Trento.', 0, 0], ['Svolta a sinistra.', 1, 80], ['Sei arrivato.', 2, 190],
    ]);
    expect(usableManeuvers({ coords, distanceM: 190, mode: 'wheelchair', maneuvers: m })).toHaveLength(3);
    expect(usableManeuvers({ coords, distanceM: 190, mode: 'foot', maneuvers: m })).toEqual([]);
  });

  it('senza istruzioni coerenti con la geometria non dà indicazioni', () => {
    expect(osrmManeuvers(route, coords)).toEqual([]);
    const wrong = { ...step(1, 'Svolta.', 10), maneuver: { instruction: 'Svolta.', type: 'turn', location: [10.5, 43.9] } };
    expect(osrmManeuvers({ ...route, legs: [{ steps: [step(0, 'Vai.', 80), wrong, step(2, 'Arrivo.', 0, 'arrive')] }] }, coords)).toEqual([]);
    expect(osrmManeuvers({ ...route, legs: [{ steps: [step(0, 'Vai.', 80)] }] }, coords)).toEqual([]); // non arriva alla fine
  });

  it('annuncia in anticipo solo con distanze utili', () => {
    expect(distanceInstruction('Svolta a destra.', 87)).toBe('Tra circa 90 metri: Svolta a destra.');
    expect(distanceInstruction('Svolta a destra.', 12)).toBe('Svolta a destra.');
  });
});
