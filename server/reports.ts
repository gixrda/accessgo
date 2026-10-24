import { randomUUID } from 'node:crypto';
import { mkdir, readFile, rename, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import {
  NOT_SURE, REPORT_CATEGORIES, VERIFICATION_STATUSES, inPisa,
  type Interpretation, type Report, type ReportCategory, type ReportDraft, type VerificationStatus,
} from '../shared/types.ts';
import { routingImpact } from '../shared/rules.ts';
import { interpret, type Photo } from './ai.ts';
import { HttpError, type Env } from './errors.ts';
import { snapToNetwork } from './routing.ts';

const MAX_PHOTO_BYTES = 1_500_000;
const DRAFT_TTL_MS = 30 * 60_000;
const MAX_DRAFTS = 200;

function parseDescription(description: unknown): string {
  if (typeof description !== 'string' || description.trim().length < 10) {
    throw new HttpError(400, 'Descrivi il problema con almeno 10 caratteri.');
  }
  if (description.length > 1000) throw new HttpError(400, 'La descrizione può avere al massimo 1000 caratteri.');
  return description.trim();
}

/** Accetta solo una data URL JPEG (il client ridimensiona e converte ogni foto in JPEG). */
function parsePhoto(photo: unknown): Photo | undefined {
  if (photo === undefined || photo === null || photo === '') return undefined;
  const m = typeof photo === 'string' ? /^data:image\/jpeg;base64,([A-Za-z0-9+/]+={0,2})$/.exec(photo) : null;
  if (!m) throw new HttpError(400, "Questa foto non si può usare. Prova con un'altra.");
  if (m[1].length * 0.75 > MAX_PHOTO_BYTES) throw new HttpError(413, "La foto è troppo grande. Prova con un'altra.");
  return { mime: 'image/jpeg', base64: m[1] };
}

// shortcut: persistenza su un file JSON locale e foto su disco (un solo processo, nessuna concorrenza tra istanze);
// passare a Supabase/Postgres + storage se l'app va pubblicata con più utenti reali.
export function createReportStore(file: string) {
  let cache: Report[] | null = null;
  let queue = Promise.resolve();
  const photoDir = join(dirname(file), 'photos');
  // Bozze in memoria: l'interpretazione mostrata a chi segnala è la stessa che viene salvata, senza fidarsi del client.
  const drafts = new Map<string, { description: string; interpretation: Interpretation; photo?: Photo; expires: number }>();

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

  async function createDraft(input: unknown, env: Env): Promise<ReportDraft> {
    const { description, photo } = (input ?? {}) as Record<string, unknown>;
    const text = parseDescription(description);
    const img = parsePhoto(photo);
    const now = Date.now();
    for (const [id, d] of drafts) if (d.expires < now) drafts.delete(id);
    if (drafts.size >= MAX_DRAFTS) drafts.delete(drafts.keys().next().value!);
    const interpretation = await interpret(text, env, img);
    const draftId = randomUUID();
    drafts.set(draftId, { description: text, interpretation, photo: img, expires: now + DRAFT_TTL_MS });
    return { draftId, interpretation };
  }

  async function create(input: unknown, env: Env): Promise<Report> {
    const { lat, lng, description, category, draftId, answer, blocking } = (input ?? {}) as Record<string, unknown>;
    if (!inPisa(lat, lng)) throw new HttpError(400, 'Il punto scelto non è a Pisa. Scegli il punto sulla mappa.');
    const text = parseDescription(description);
    if (category !== undefined && category !== null && category !== '' && !REPORT_CATEGORIES.includes(category as ReportCategory)) {
      throw new HttpError(400, 'Categoria non valida.');
    }
    const reports = await all();
    // Protezione da doppio invio: stesso testo, stesso punto, meno di 2 minuti fa.
    const dup = reports.find((r) => r.description === text && Math.abs(r.lat - (lat as number)) < 5e-5
      && Math.abs(r.lng - (lng as number)) < 5e-5 && Date.now() - Date.parse(r.createdAt) < 120_000);
    if (dup) throw new HttpError(409, 'Hai appena inviato questa segnalazione: non serve inviarla di nuovo.');

    const draft = typeof draftId === 'string' ? drafts.get(draftId) : undefined;
    const fromDraft = draft && draft.expires >= Date.now() && draft.description === text ? draft : undefined;
    const interpretation = fromDraft?.interpretation ?? await interpret(text, env);

    let followUp: Report['followUp'];
    if (answer !== undefined && answer !== null && answer !== '') {
      const q = interpretation.question;
      if (!q || typeof answer !== 'string' || ![...q.options, NOT_SURE].includes(answer)) throw new HttpError(400, 'La risposta scelta non è valida. Scegline una tra quelle proposte.');
      followUp = { question: q.text, answer };
    }

    const userCategory = category ? category as ReportCategory : null;
    const userBlocking = blocking === true || blocking === false || blocking === null;
    const finalBlocking = userBlocking ? blocking as boolean | null : interpretation.blocking;
    const finalCategory = userCategory ?? interpretation.category;
    // Le coordinate vengono solo dalla mappa; il punto agganciato alla rete serve per escludere il tratto giusto.
    const snap = await snapToNetwork({ lat: lat as number, lng: lng as number });
    const report: Report = {
      id: randomUUID(),
      lat: lat as number,
      lng: lng as number,
      description: text,
      category: finalCategory,
      categorySource: userCategory ? 'user' : 'interpretation',
      createdAt: new Date().toISOString(),
      status: 'unverified', // sempre: né l'invio né l'AI verificano una segnalazione
      source: 'user_report',
      interpretation,
      hasPhoto: Boolean(fromDraft?.photo),
      // La risposta di chi segnala ("si riesce a passare?") prevale sulla proposta dell'analisi.
      blocking: finalBlocking,
      blockingSource: userBlocking ? 'user' : 'interpretation',
      snap: snap && Number.isFinite(snap.distanceM) ? snap : null,
      impact: routingImpact(finalCategory, finalBlocking, snap ? snap.distanceM : null),
      ...(followUp ? { followUp } : {}),
    };
    if (fromDraft?.photo) {
      await mkdir(photoDir, { recursive: true });
      await writeFile(join(photoDir, `${report.id}.jpg`), Buffer.from(fromDraft.photo.base64, 'base64'));
    }
    if (typeof draftId === 'string') drafts.delete(draftId);
    reports.push(report);
    await persist();
    return report;
  }

  async function photo(id: string): Promise<Buffer> {
    const report = (await all()).find((r) => r.id === id);
    if (!report?.hasPhoto) throw new HttpError(404, 'Foto non trovata.');
    return readFile(join(photoDir, `${report.id}.jpg`));
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

  return { all, createDraft, create, photo, setStatus };
}
