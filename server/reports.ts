import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';
import {
  REPORT_CATEGORIES, VERIFICATION_STATUSES, inPisa,
  type Report, type ReportCategory, type VerificationStatus,
} from '../shared/types.ts';
import { interpret } from './ai.ts';
import { HttpError, type Env } from './errors.ts';

// shortcut: persistenza su un file JSON locale (un solo processo, nessuna concorrenza tra istanze);
// passare a Supabase/Postgres se l'app va pubblicata con più utenti reali.
export function createReportStore(file: string) {
  let cache: Report[] | null = null;
  let queue = Promise.resolve();

  async function all(): Promise<Report[]> {
    if (cache) return cache;
    try {
      cache = JSON.parse(await readFile(file, 'utf8')) as Report[];
    } catch (e) {
      if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; // file corrotto: non lo sovrascriviamo
      cache = [];
    }
    return cache;
  }

  // Scritture serializzate e atomiche (file temporaneo + rename) per non corrompere i dati.
  function persist(): Promise<void> {
    queue = queue.then(async () => {
      await mkdir(dirname(file), { recursive: true });
      await writeFile(`${file}.tmp`, JSON.stringify(cache, null, 2));
      await rename(`${file}.tmp`, file);
    });
    return queue;
  }

  async function create(input: unknown, env: Env): Promise<Report> {
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
    const reports = await all();
    // Protezione da doppio invio: stesso testo, stesso punto, meno di 2 minuti fa.
    const dup = reports.find((r) => r.description === text && Math.abs(r.lat - (lat as number)) < 5e-5
      && Math.abs(r.lng - (lng as number)) < 5e-5 && Date.now() - Date.parse(r.createdAt) < 120_000);
    if (dup) throw new HttpError(409, 'Questa segnalazione è appena stata inviata.');

    const interpretation = await interpret(text, env);
    const userCategory = category ? category as ReportCategory : null;
    const report: Report = {
      id: randomUUID(),
      lat: lat as number,
      lng: lng as number,
      description: text,
      category: userCategory ?? interpretation.category,
      categorySource: userCategory ? 'user' : 'interpretation',
      createdAt: new Date().toISOString(),
      status: 'unverified', // sempre: né l'invio né l'AI verificano una segnalazione
      source: 'user_report',
      interpretation,
    };
    reports.push(report);
    await persist();
    return report;
  }

  async function setStatus(id: string, status: unknown): Promise<Report> {
    if (!VERIFICATION_STATUSES.includes(status as VerificationStatus)) throw new HttpError(400, 'Stato non valido.');
    const report = (await all()).find((r) => r.id === id);
    if (!report) throw new HttpError(404, 'Segnalazione non trovata.');
    report.status = status as VerificationStatus;
    report.statusUpdatedAt = new Date().toISOString();
    await persist();
    return report;
  }

  return { all, create, setStatus };
}
