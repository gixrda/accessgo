import { REPORT_CATEGORIES, type FollowUpQuestion, type Interpretation, type ReportCategory, type Severity } from '../shared/types.ts';
import type { Env } from './errors.ts';

export const DEFAULT_GEMMA_MODEL = 'gemma-4-26b-a4b-it';
let RETRY_MS = 1500;
/** Solo per i test. */
export const setRetryDelay = (ms: number) => { RETRY_MS = ms; };

export type Photo = { mime: string; base64: string };

export function aiProvider(env: Env): { kind: 'gemma-ollama' | 'gemma-google' | 'fallback'; model?: string } {
  if (env.OLLAMA_URL && env.OLLAMA_MODEL) return { kind: 'gemma-ollama', model: env.OLLAMA_MODEL };
  if (env.GEMINI_API_KEY) return { kind: 'gemma-google', model: env.GEMMA_MODEL || DEFAULT_GEMMA_MODEL };
  return { kind: 'fallback' };
}

/**
 * Assistente segnalazioni: struttura testo (+ foto facoltativa) e propone UNA domanda sull'informazione mancante più utile.
 * Non lancia mai: se l'AI manca o fallisce usa il fallback a regole e lo dichiara.
 */
export async function interpret(description: string, env: Env, photo?: Photo): Promise<Interpretation> {
  const p = aiProvider(env);
  const photoNote = photo ? ' La foto non è stata analizzata.' : '';
  if (p.kind === 'fallback') return fallbackInterpret(description, `Servizio AI non configurato: classificazione automatica a parole chiave.${photoNote}`);
  const call = (img?: Photo) => p.kind === 'gemma-ollama'
    ? callOllama(env.OLLAMA_URL!, p.model!, buildPrompt(description, Boolean(img)), img)
    : callGoogle(env.GEMINI_API_KEY!, p.model!, buildPrompt(description, Boolean(img)), img);
  let note: string | undefined;
  try {
    let raw: string;
    try {
      raw = await call(photo);
    } catch (e) {
      if (!photo) throw e;
      // Se il modello rifiuta l'immagine, l'interpretazione del testo resta utile: riproviamo senza foto e lo diciamo.
      raw = await call();
      note = 'La foto non è stata analizzata dal modello.';
    }
    const parsed = validateInterpretation(extractJson(raw));
    // Una nota sulla foto è accettata solo se il modello ha davvero ricevuto la foto.
    if (parsed) return { ...parsed, ...(photo && !note ? {} : { photo_note: null }), engine: 'gemma', model: p.model, ...(note ? { note } : {}) };
    return fallbackInterpret(description, `Risposta AI non valida: classificazione automatica a parole chiave.${photoNote}`);
  } catch {
    return fallbackInterpret(description, `Servizio AI non disponibile: classificazione automatica a parole chiave.${photoNote}`);
  }
}

export function buildPrompt(description: string, hasPhoto: boolean): string {
  return `Sei l'assistente di AccessGo, che raccoglie segnalazioni di barriere architettoniche per persone in sedia a rotelle a Pisa.
Leggi la segnalazione${hasPhoto ? ' e osserva la foto allegata' : ''} e rispondi SOLO con un oggetto JSON, senza testo aggiuntivo, con queste chiavi:
- "category": una tra ${REPORT_CATEGORIES.map((c) => `"${c}"`).join(', ')}
  (steps=scale o gradini, kerb=cordolo, obstructed_sidewalk=marciapiede ostruito, uneven_surface=superficie irregolare,
  slope=pendenza, crossing=attraversamento, other=altro)
- "obstacle": l'ostacolo in una o due parole in italiano, oppure null se non è chiaro
- "summary": riassunto in italiano, massimo 160 caratteri, senza aggiungere fatti non presenti nel testo
- "severity": "low", "medium" o "high" SOLO se il testo lo dice esplicitamente, altrimenti "unknown"
- "missing_info": elenco (max 4) di informazioni utili che mancano (es. altezza del gradino, se è temporaneo)
- "question": UNA domanda breve (max 100 caratteri) per chiedere a chi segnala l'informazione mancante più utile
  per una persona in sedia a rotelle, con "options": da 2 a 4 risposte brevi (max 30 caratteri). Formato:
  {"text": "...", "options": ["...", "..."]}. Non includere "Non so": viene aggiunto dall'app.
  Se "missing_info" non è vuoto, chiedi la più importante; usa null solo se non manca nulla di importante.
${hasPhoto
    ? `- "photo_note": cosa mostra la foto rispetto all'ostacolo, in una frase (max 160 caratteri), solo ciò che è chiaramente visibile.
  Se la foto non mostra l'ostacolo descritto, dillo. Non identificare persone e non riportare targhe.`
    : '- "photo_note": null'}
Regole: non inventare indirizzi, coordinate, misure o gravità. Non dire mai che la segnalazione è verificata.
La posizione è già indicata da chi segnala sulla mappa: non chiederla e non elencarla tra le informazioni mancanti.

Segnalazione: """${description.replaceAll('"""', '"')}"""`;
}

async function callGoogle(key: string, model: string, prompt: string, photo?: Photo): Promise<string> {
  const parts = [
    ...(photo ? [{ inline_data: { mime_type: photo.mime, data: photo.base64 } }] : []),
    { text: prompt },
  ];
  const request = () => fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({
      contents: [{ role: 'user', parts }],
      // Senza ragionamento esteso Gemma 4 risponde in ~5 s invece di ~20 s (misurato), con risposte equivalenti.
      generationConfig: { temperature: 0.1, ...(model.startsWith('gemma-4') ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}) },
    }),
    signal: AbortSignal.timeout(30_000),
  });
  let res = await request();
  // Il piano gratuito restituisce a volte errori temporanei (sovraccarico): un solo nuovo tentativo.
  if ([429, 500, 503].includes(res.status)) {
    await new Promise((r) => setTimeout(r, RETRY_MS));
    res = await request();
  }
  if (!res.ok) throw new Error(`google ${res.status}`);
  const json = await res.json() as { candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[] };
  // Gemma 4 può restituire parti di "ragionamento": teniamo solo la risposta.
  return json.candidates?.[0]?.content?.parts?.filter((x) => !x.thought).map((x) => x.text ?? '').join('') ?? '';
}

async function callOllama(baseUrl: string, model: string, prompt: string, photo?: Photo): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model, format: 'json', stream: false, options: { temperature: 0.1 },
      messages: [{ role: 'user', content: prompt, ...(photo ? { images: [photo.base64] } : {}) }],
    }),
    signal: AbortSignal.timeout(90_000),
  });
  if (!res.ok) throw new Error(`ollama ${res.status}`);
  const json = await res.json() as { message?: { content?: string } };
  return json.message?.content ?? '';
}

/** Estrae il primo oggetto JSON dal testo del modello (accetta blocchi ```json). */
export function extractJson(text: string): unknown {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(text.slice(start, end + 1)); } catch { return null; }
}

const SEVERITIES: Severity[] = ['low', 'medium', 'high', 'unknown'];
const str = (v: unknown, max: number) => typeof v === 'string' && v.trim() ? v.trim().slice(0, max) : null;

function validateQuestion(q: unknown): FollowUpQuestion | null {
  if (!q || typeof q !== 'object') return null;
  const { text, options } = q as Record<string, unknown>;
  const t = str(text, 140);
  if (!t || !Array.isArray(options)) return null;
  const opts = [...new Set(options.map((o) => str(o, 40)).filter((o): o is string => o !== null && !/^non (lo )?so\.?$|^non sono sicur/i.test(o)))].slice(0, 4);
  return opts.length >= 2 ? { text: t, options: opts } : null;
}

/**
 * Valida l'output del modello. Restituisce null se la categoria o il riassunto non sono validi.
 * Campi come "verification_status" vengono ignorati: lo stato non è mai deciso dall'AI.
 */
export function validateInterpretation(x: unknown): Omit<Interpretation, 'engine' | 'model' | 'note'> | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!REPORT_CATEGORIES.includes(o.category as ReportCategory)) return null;
  const summary = str(o.summary, 300);
  if (!summary) return null;
  return {
    category: o.category as ReportCategory,
    obstacle: str(o.obstacle, 60),
    summary,
    severity: SEVERITIES.includes(o.severity as Severity) ? o.severity as Severity : 'unknown',
    missing_info: Array.isArray(o.missing_info)
      ? o.missing_info.map((m) => str(m, 120)).filter((m): m is string => m !== null).slice(0, 4)
      : [],
    question: validateQuestion(o.question),
    photo_note: str(o.photo_note, 200),
  };
}

// Ordine = priorità: la prima categoria che corrisponde vince.
const RULES: [ReportCategory, RegExp][] = [
  ['steps', /\b(gradin\w*|scal[aeio]\w*|scalin\w*)/],
  ['kerb', /\b(cordol\w*|marciapiede\s+(troppo\s+)?alto|bordo\s+del\s+marciapiede)/],
  ['crossing', /\b(attraversament\w*|strisce|semafor\w*|incroci\w*)/],
  ['obstructed_sidewalk', /\b(ostruit\w*|bloccat\w*|parcheggiat\w*|auto|macchin\w*|motorin\w*|scooter|monopattin\w*|cantier\w*|transenn\w*|bidon\w*|cassonett\w*|tavolin\w*|dehors|ingombr\w*|occupat\w*)/],
  ['uneven_surface', /\b(buc[ah]\w*|sconness\w*|dissestat\w*|irregolar\w*|sampietrin\w*|ciottol\w*|pav[eé]|radic\w*|ghiaia|crep\w*|rott\w*|sterrat\w*)/],
  ['slope', /\b(pendenz\w*|salit\w*|discesa|ripid\w*|rampa)/],
];

/** Classificazione deterministica a parole chiave. NON è AI: è marcata engine="fallback". */
export function fallbackInterpret(description: string, note: string): Interpretation {
  const text = description.toLowerCase();
  let category: ReportCategory = 'other';
  let obstacle: string | null = null;
  for (const [cat, re] of RULES) {
    const m = re.exec(text);
    if (m) { category = cat; obstacle = m[0]; break; }
  }
  const needsHeight = (category === 'steps' || category === 'kerb') && !/\d+\s*(cm|centimetri|m\b|metri)/.test(text);
  const needsDuration = !/(temporane|permanent|sempre|da (giorni|mesi|anni)|oggi|cantiere)/.test(text);
  const missing: string[] = [];
  if (needsHeight) missing.push("Altezza dell'ostacolo");
  if (needsDuration) missing.push("Se l'ostacolo è temporaneo o permanente");
  if (!/(alternativ|aggir|altro lato|dall'altra parte)/.test(text)) missing.push('Se esiste un passaggio alternativo vicino');
  const question: FollowUpQuestion | null = needsHeight
    ? { text: "Quanto è alto l'ostacolo, più o meno?", options: ['Meno di 3 cm', 'Tra 3 e 10 cm', 'Più di 10 cm'] }
    : needsDuration ? { text: "L'ostacolo è temporaneo o permanente?", options: ['Temporaneo', 'Permanente'] } : null;
  const clean = description.trim().replace(/\s+/g, ' ');
  return {
    category, obstacle,
    // Senza AI non riassumiamo: riportiamo il testo originale (eventualmente troncato) per non alterarne il significato.
    summary: clean.length > 160 ? `${clean.slice(0, 157)}…` : clean,
    severity: 'unknown',
    missing_info: missing,
    question,
    photo_note: null,
    engine: 'fallback',
    note,
  };
}
