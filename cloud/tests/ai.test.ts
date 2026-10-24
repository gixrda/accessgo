import { afterEach, describe, expect, it, vi } from 'vitest';
import { extractJson, fallbackInterpret, interpret, validateInterpretation } from '../server/ai.ts';

const VIA_ROMA = "In Via Roma c'è un gradino troppo alto e non riesco a passare con la sedia a rotelle.";

afterEach(() => vi.unstubAllGlobals());

describe('fallbackInterpret (regole, non AI)', () => {
  it("classifica l'esempio di Via Roma senza inventare gravità o misure", () => {
    const r = fallbackInterpret(VIA_ROMA, 'nota');
    expect(r).toMatchObject({ category: 'steps', obstacle: 'gradino', severity: 'unknown', engine: 'fallback', note: 'nota' });
    expect(r.summary).toBe(VIA_ROMA);
    expect(r.missing_info).toContain("Altezza dell'ostacolo");
  });

  it.each([
    ['Il cordolo davanti alla farmacia è troppo alto', 'kerb'],
    ['Auto parcheggiata sul marciapiede, non si passa', 'obstructed_sidewalk'],
    ['Pavimentazione dissestata con buche profonde', 'uneven_surface'],
    ['Salita molto ripida verso il ponte', 'slope'],
    ['Il semaforo pedonale dura pochissimo', 'crossing'],
    ['Il portone è troppo pesante da aprire', 'other'],
  ])('%s → %s', (text, category) => {
    expect(fallbackInterpret(text, '').category).toBe(category);
  });

  it('non chiede l\'altezza se è già indicata', () => {
    expect(fallbackInterpret('Gradino di 15 cm', '').missing_info).not.toContain("Altezza dell'ostacolo");
  });
});

describe('validateInterpretation', () => {
  it('accetta un output valido e ignora lo stato di verifica proposto dal modello', () => {
    const v = validateInterpretation({ category: 'steps', obstacle: 'gradino', summary: 'Gradino alto', severity: 'high', missing_info: ['altezza', 3], verification_status: 'verified' });
    expect(v).toEqual({ category: 'steps', obstacle: 'gradino', summary: 'Gradino alto', severity: 'high', missing_info: ['altezza'] });
    expect(v).not.toHaveProperty('verification_status');
  });

  it('rifiuta categorie sconosciute o riassunti vuoti', () => {
    expect(validateInterpretation({ category: 'lava', summary: 'x' })).toBeNull();
    expect(validateInterpretation({ category: 'steps', summary: '  ' })).toBeNull();
    expect(validateInterpretation(null)).toBeNull();
  });

  it('riporta a "unknown" una gravità non valida', () => {
    expect(validateInterpretation({ category: 'kerb', summary: 'x', severity: 'catastrofica' })?.severity).toBe('unknown');
  });
});

describe('extractJson', () => {
  it('estrae JSON anche da blocchi markdown', () => {
    expect(extractJson('```json\n{"category":"steps"}\n```')).toEqual({ category: 'steps' });
    expect(extractJson('nessun json')).toBeNull();
    expect(extractJson('{rotto')).toBeNull();
  });
});

describe('interpret', () => {
  it('senza credenziali usa il fallback dichiarato', async () => {
    const r = await interpret(VIA_ROMA, {});
    expect(r.engine).toBe('fallback');
    expect(r.note).toMatch(/non configurato/);
  });

  it('usa Gemma via Google AI Studio quando la chiave è presente', async () => {
    const fetchMock = vi.fn(async () => Response.json({
      candidates: [{ content: { parts: [{ text: '```json\n{"category":"steps","obstacle":"gradino","summary":"Gradino segnalato come difficoltoso","severity":"unknown","missing_info":["altezza"]}\n```' }] } }],
    }));
    vi.stubGlobal('fetch', fetchMock);
    const r = await interpret(VIA_ROMA, { GEMINI_API_KEY: 'k' });
    expect(r).toMatchObject({ engine: 'gemma', model: 'gemma-3-27b-it', category: 'steps' });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toContain('/models/gemma-3-27b-it:generateContent');
    expect((init.headers as Record<string, string>)['x-goog-api-key']).toBe('k');
  });

  it('usa Ollama quando configurato', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ message: { content: '{"category":"kerb","obstacle":null,"summary":"Cordolo alto","severity":"unknown","missing_info":[]}' } })));
    expect(await interpret('cordolo alto', { OLLAMA_URL: 'http://localhost:11434', OLLAMA_MODEL: 'gemma3' })).toMatchObject({ engine: 'gemma', model: 'gemma3', category: 'kerb' });
  });

  it('se il servizio AI fallisce o risponde male, usa il fallback e lo dichiara', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('err', { status: 500 })));
    expect(await interpret(VIA_ROMA, { GEMINI_API_KEY: 'k' })).toMatchObject({ engine: 'fallback', note: expect.stringMatching(/non disponibile/) });
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidates: [{ content: { parts: [{ text: 'Non so.' }] } }] })));
    expect(await interpret(VIA_ROMA, { GEMINI_API_KEY: 'k' })).toMatchObject({ engine: 'fallback', note: expect.stringMatching(/non valida/) });
  });
});
