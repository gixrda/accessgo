import { REPORT_CATEGORIES, type Interpretation, type ReportCategory, type Severity } from '../shared/types.ts';
import type { Env } from './errors.ts';

export function aiProvider(env: Env): { kind: 'gemma-ollama' | 'gemma-google' | 'fallback'; model?: string } {
  if (env.OLLAMA_URL && env.OLLAMA_MODEL) return { kind: 'gemma-ollama', model: env.OLLAMA_MODEL };
  if (env.GEMINI_API_KEY) return { kind: 'gemma-google', model: env.GEMMA_MODEL || 'gemma-3-27b-it' };
  return { kind: 'fallback' };
}

/** Interpreta una segnalazione. Non lancia mai: se l'AI manca o fallisce, usa il fallback a regole e lo dichiara. */
export async function interpret(description: string, env: Env): Promise<Interpretation> {
  const p = aiProvider(env);
  if (p.kind === 'fallback') return fallbackInterpret(description, 'Servizio AI non configurato: classificazione automatica a parole chiave.');
  try {
    const raw = p.kind === 'gemma-ollama'
      ? await callOllama(env.OLLAMA_URL!, p.model!, buildPrompt(description))
      : await callGoogle(env.GEMINI_API_KEY!, p.model!, buildPrompt(description));
    const parsed = validateInterpretation(extractJson(raw));
    if (parsed) return { ...parsed, engine: 'gemma', model: p.model };
    return fallbackInterpret(description, 'Risposta AI non valida: classificazione automatica a parole chiave.');
  } catch {
    return fallbackInterpret(description, 'Servizio AI non disponibile: classificazione automatica a parole chiave.');
  }
}

export function buildPrompt(description: string): string {
  // Gemma via Gemini API non supporta un system prompt separato: le istruzioni stanno nel messaggio utente.
  return `Sei un assistente che struttura segnalazioni di barriere architettoniche per persone in sedia a rotelle.
Leggi la segnalazione e rispondi SOLO con un oggetto JSON, senza testo aggiuntivo, con queste chiavi:
- "category": una tra ${REPORT_CATEGORIES.map((c) => `"${c}"`).join(', ')}
  (steps=scale o gradini, kerb=cordolo, obstructed_sidewalk=marciapiede ostruito, uneven_surface=superficie irregolare,
  slope=pendenza, crossing=attraversamento, other=altro)
- "obstacle": l'ostacolo in una o due parole in italiano, oppure null se non è chiaro
- "summary": riassunto in italiano, massimo 160 caratteri, senza aggiungere fatti non presenti nel testo
- "severity": "low", "medium" o "high" SOLO se il testo lo dice esplicitamente, altrimenti "unknown"
- "missing_info": elenco (max 4) di informazioni utili che mancano (es. altezza del gradino, se è temporaneo)
Regole: non inventare indirizzi, coordinate, misure o gravità. Non dire mai che la segnalazione è verificata.

Segnalazione: """${description.replaceAll('"""', '"')}"""`;
}

async function callGoogle(key: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
    body: JSON.stringify({ contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { temperature: 0.1 } }),
    signal: AbortSignal.timeout(20_000),
  });
  if (!res.ok) throw new Error(`google ${res.status}`);
  const json = await res.json() as { candidates?: { content?: { parts?: { text?: string }[] } }[] };
  return json.candidates?.[0]?.content?.parts?.map((x) => x.text ?? '').join('') ?? '';
}

async function callOllama(baseUrl: string, model: string, prompt: string): Promise<string> {
  const res = await fetch(`${baseUrl.replace(/\/$/, '')}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ model, messages: [{ role: 'user', content: prompt }], format: 'json', stream: false, options: { temperature: 0.1 } }),
    signal: AbortSignal.timeout(60_000),
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

/**
 * Valida l'output del modello. Restituisce null se la categoria o il riassunto non sono validi.
 * Campi come "verification_status" vengono ignorati: lo stato non è mai deciso dall'AI.
 */
export function validateInterpretation(x: unknown): Omit<Interpretation, 'engine' | 'model' | 'note'> | null {
  if (!x || typeof x !== 'object') return null;
  const o = x as Record<string, unknown>;
  if (!REPORT_CATEGORIES.includes(o.category as ReportCategory)) return null;
  if (typeof o.summary !== 'string' || !o.summary.trim()) return null;
  return {
    category: o.category as ReportCategory,
    obstacle: typeof o.obstacle === 'string' && o.obstacle.trim() ? o.obstacle.trim().slice(0, 60) : null,
    summary: o.summary.trim().slice(0, 300),
    severity: SEVERITIES.includes(o.severity as Severity) ? o.severity as Severity : 'unknown',
    missing_info: Array.isArray(o.missing_info)
      ? o.missing_info.filter((m): m is string => typeof m === 'string' && m.trim() !== '').slice(0, 4).map((m) => m.slice(0, 120))
      : [],
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
  const missing: string[] = [];
  if ((category === 'steps' || category === 'kerb') && !/\d+\s*(cm|centimetri|m\b|metri)/.test(text)) missing.push("Altezza dell'ostacolo");
  if (!/(temporane|permanent|sempre|da (giorni|mesi|anni)|oggi|cantiere)/.test(text)) missing.push("Se l'ostacolo è temporaneo o permanente");
  if (!/(alternativ|aggir|altro lato|dall'altra parte)/.test(text)) missing.push('Se esiste un passaggio alternativo vicino');
  const clean = description.trim().replace(/\s+/g, ' ');
  return {
    category, obstacle,
    // Senza AI non riassumiamo: riportiamo il testo originale (eventualmente troncato) per non alterarne il significato.
    summary: clean.length > 160 ? `${clean.slice(0, 157)}…` : clean,
    severity: 'unknown',
    missing_info: missing,
    engine: 'fallback',
    note,
  };
}
