import { HttpError } from './errors.ts';

const PROVIDER_KEY = 'gemma-analysis-preview';
const GAP_MS = 5_000;
const UNAVAILABLE = 'Analisi temporaneamente non disponibile. Riprova più tardi.';
const BUSY = 'Analisi momentaneamente occupata. Attendi 5 secondi e riprova.';

/** Preview accepts only the text; coordinates, identities and categories are not used. */
export function analysisDescription(input: unknown): string {
  const description = input && typeof input === 'object' && !Array.isArray(input)
    ? (input as Record<string, unknown>).description : undefined;
  if (typeof description !== 'string' || description.trim().length < 10) {
    throw new HttpError(400, 'Descrivi il problema con almeno 10 caratteri.');
  }
  if (description.length > 1000) {
    throw new HttpError(400, 'La descrizione può avere al massimo 1000 caratteri.');
  }
  return description.trim();
}

/** Shared across Workers; stores only an app-wide timestamp, never preview text or identity. */
export async function reserveAnalysisSlot(db?: D1Database): Promise<void> {
  if (!db) throw new HttpError(503, UNAVAILABLE);
  const now = Date.now();
  let acquired: { next_at: number } | null;
  try {
    acquired = await db.prepare(`
      INSERT INTO provider_limits (key, next_at) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET next_at = excluded.next_at
      WHERE provider_limits.next_at <= ?
      RETURNING next_at
    `).bind(PROVIDER_KEY, now + GAP_MS, now).first<{ next_at: number }>();
  } catch {
    // Fail closed when the shared limiter is unavailable; do not leak database details.
    throw new HttpError(503, UNAVAILABLE);
  }
  if (!acquired) throw new HttpError(429, BUSY);
}
