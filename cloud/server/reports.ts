import {
  REPORT_CATEGORIES, VERIFICATION_STATUSES, inPisa,
  type Report, type ReportCategory, type VerificationStatus,
} from '../shared/types.ts';
import { interpret } from './ai.ts';
import { HttpError, type Env } from './errors.ts';

const DUPLICATE_WINDOW_MS = 120_000;
const QUOTA_WINDOW_MS = 600_000;
const MAX_REPORTS_PER_WINDOW = 5;

/** D1 is shared by Worker instances; each conditional insert is atomic. */
export function createReportStore(db: D1Database) {
  async function all(): Promise<Report[]> {
    const result = await db.prepare('SELECT payload FROM reports ORDER BY created_at_ms DESC')
      .all<{ payload: string }>();
    return result.results.map((row) => JSON.parse(row.payload) as Report);
  }

  async function submissionState(userId: string, description: string, lat: number, lng: number, now: number) {
    return db.prepare(`SELECT
      EXISTS(SELECT 1 FROM reports WHERE description = ? AND ABS(lat - ?) < 0.00005
        AND ABS(lng - ?) < 0.00005 AND created_at_ms > ?) AS duplicate,
      (SELECT COUNT(*) FROM reports WHERE user_id = ? AND created_at_ms > ?) AS recent`)
      .bind(description, lat, lng, now - DUPLICATE_WINDOW_MS, userId, now - QUOTA_WINDOW_MS)
      .first<{ duplicate: number; recent: number }>();
  }

  async function checkSubmission(userId: string, text: string, lat: number, lng: number, now: number) {
    const state = await submissionState(userId, text, lat, lng, now);
    if (state?.duplicate) throw new HttpError(409, 'Questa segnalazione è appena stata inviata.');
    if ((state?.recent ?? 0) >= MAX_REPORTS_PER_WINDOW) {
      throw new HttpError(429, 'Hai inviato diverse segnalazioni. Attendi 10 minuti prima di riprovare.');
    }
  }

  async function create(input: unknown, env: Env, userId: string): Promise<Report> {
    if (!userId) throw new HttpError(401, 'Accedi con ChatGPT per inviare una segnalazione.');
    const { lat, lng, description, category } = (input ?? {}) as Record<string, unknown>;
    if (!inPisa(lat, lng)) throw new HttpError(400, 'Posizione non valida: seleziona un punto sulla mappa di Pisa.');
    if (typeof description !== 'string' || description.trim().length < 10) {
      throw new HttpError(400, 'Descrivi il problema con almeno 10 caratteri.');
    }
    if (description.length > 1000) throw new HttpError(400, 'La descrizione può avere al massimo 1000 caratteri.');
    if (category !== undefined && category !== null && category !== '' && !REPORT_CATEGORIES.includes(category as ReportCategory)) {
      throw new HttpError(400, 'Categoria non valida.');
    }
    const text = description.trim();
    const latitude = lat as number;
    const longitude = lng as number;
    await checkSubmission(userId, text, latitude, longitude, Date.now());
    const interpretation = await interpret(text, env);
    const userCategory = category ? category as ReportCategory : null;
    if (interpretation.category === 'no_obstacle') {
      throw new HttpError(400, 'Il testo non segnala un ostacolo attuale. Non verrà pubblicato sulla mappa; nessuna segnalazione esistente viene risolta automaticamente.');
    }
    const reportCategory = userCategory ?? interpretation.category;
    if (reportCategory === 'unclear') {
      throw new HttpError(400, 'Descrivi meglio l’ostacolo oppure scegli manualmente la categoria prima di pubblicare.');
    }
    const now = Date.now();
    const report: Report = {
      id: crypto.randomUUID(), lat: latitude, lng: longitude, description: text,
      category: reportCategory,
      categorySource: userCategory ? 'user' : 'interpretation',
      createdAt: new Date(now).toISOString(),
      status: 'unverified', source: 'user_report', interpretation,
    };
    // Repeat both checks inside the write: concurrent requests cannot bypass either guard.
    const result = await db.prepare(`INSERT INTO reports (id, user_id, lat, lng, description, created_at_ms, payload)
      SELECT ?, ?, ?, ?, ?, ?, ?
      WHERE NOT EXISTS (SELECT 1 FROM reports WHERE description = ? AND ABS(lat - ?) < 0.00005
        AND ABS(lng - ?) < 0.00005 AND created_at_ms > ?)
      AND (SELECT COUNT(*) FROM reports WHERE user_id = ? AND created_at_ms > ?) < ?`)
      .bind(report.id, userId, latitude, longitude, text, now, JSON.stringify(report),
        text, latitude, longitude, now - DUPLICATE_WINDOW_MS,
        userId, now - QUOTA_WINDOW_MS, MAX_REPORTS_PER_WINDOW)
      .run();
    if (!result.meta.changes) {
      await checkSubmission(userId, text, latitude, longitude, now);
      throw new HttpError(409, 'Invio contemporaneo rilevato. Riprova tra qualche secondo.');
    }
    return report;
  }

  async function setStatus(id: string, status: unknown): Promise<Report> {
    if (!VERIFICATION_STATUSES.includes(status as VerificationStatus)) throw new HttpError(400, 'Stato non valido.');
    const row = await db.prepare(`UPDATE reports
      SET payload = json_set(payload, '$.status', ?, '$.statusUpdatedAt', ?)
      WHERE id = ? RETURNING payload`)
      .bind(status, new Date().toISOString(), id).first<{ payload: string }>();
    if (!row) throw new HttpError(404, 'Segnalazione non trovata.');
    return JSON.parse(row.payload) as Report;
  }

  return { all, create, setStatus };
}
