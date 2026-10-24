import { inPisa, type OsmDataset } from '../shared/types.ts';
import { aiProvider, interpret } from './ai.ts';
import { analysisDescription, reserveAnalysisSlot } from './analysis-preview.ts';
import { HttpError, type Env } from './errors.ts';
import { createGeocoder } from './geocoding.ts';
import { createReportStore } from './reports.ts';
import { getFootRoute, getRoute } from './routing.ts';

export interface CloudApiOptions {
  env: Env;
  db?: D1Database;
  osm: OsmDataset;
  /** Must come from Sites' trusted identity integration, never from the JSON body. */
  getUserId(): Promise<string | null>;
}

const MAX_BODY_BYTES = 16_384;

export async function readJsonBody(req: Request): Promise<unknown> {
  if (req.headers.get('content-type')?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    throw new HttpError(415, 'Invia una richiesta in formato JSON.');
  }
  const declaredLength = req.headers.get('content-length');
  if (declaredLength && Number(declaredLength) > MAX_BODY_BYTES) throw new HttpError(413, 'Richiesta troppo grande.');
  const reader = req.body?.getReader();
  if (!reader) return null;
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > MAX_BODY_BYTES) {
        await reader.cancel();
        throw new HttpError(413, 'Richiesta troppo grande.');
      }
      chunks.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  if (!size) return null;
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  try { return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes)); }
  catch { throw new HttpError(400, 'JSON non valido.'); }
}

/** Reporting and analysis require Origin; anonymous route clients may omit it. */
export function requireSameOrigin(req: Request, required: boolean): void {
  const origin = req.headers.get('origin');
  if ((required && !origin) || (origin && origin !== new URL(req.url).origin)
    || req.headers.get('sec-fetch-site') === 'cross-site') {
    throw new HttpError(403, 'Invia la richiesta dal sito AccessGo.');
  }
}

function send(status: number, data: unknown, cacheControl = 'no-store') {
  return Response.json(data, {
    status,
    headers: { 'Cache-Control': cacheControl, 'X-Content-Type-Options': 'nosniff' },
  });
}

export function createCloudApi({ env, db, osm, getUserId }: CloudApiOptions) {
  function database(): D1Database {
    if (!db) throw new HttpError(503, 'Archivio temporaneamente non disponibile. Riprova più tardi.');
    return db;
  }

  return async function handle(req: Request): Promise<Response> {
    const url = new URL(req.url);
    const path = url.pathname;
    const method = req.method;
    try {
      if (method === 'GET' && path === '/api/status') {
        const ai = aiProvider(env);
        return send(200, {
          routing: env.ORS_API_KEY ? 'openrouteservice' : 'valhalla',
          ai: ai.kind, ...(ai.model ? { aiModel: ai.model } : {}),
          admin: Boolean(env.ADMIN_TOKEN),
          reportRequiresSignIn: true,
          reportSignedIn: Boolean(await getUserId()),
        });
      }
      if (method === 'GET' && path === '/api/osm') return send(200, osm, 'public, max-age=300');
      if (method === 'GET' && path === '/api/reports') return send(200, await createReportStore(database()).all());
      if (method === 'POST' && path === '/api/analyze') {
        requireSameOrigin(req, true);
        const description = analysisDescription(await readJsonBody(req));
        await reserveAnalysisSlot(db);
        // Preview does not use the report store or look up the visitor's identity.
        return send(200, { interpretation: await interpret(description, env), published: false });
      }
      if (method === 'POST' && path === '/api/reports') {
        const userId = await getUserId();
        if (!userId) throw new HttpError(401, 'Accedi con ChatGPT per inviare una segnalazione. Puoi usare la mappa senza accedere.');
        requireSameOrigin(req, true);
        return send(201, await createReportStore(database()).create(await readJsonBody(req), env, userId));
      }
      const match = /^\/api\/reports\/([\w-]+)$/.exec(path);
      if (method === 'PATCH' && match) {
        if (!env.ADMIN_TOKEN) throw new HttpError(403, 'Modifica degli stati non abilitata su questo server.');
        if (req.headers.get('x-admin-token') !== env.ADMIN_TOKEN) throw new HttpError(401, 'Codice moderatore non valido.');
        requireSameOrigin(req, true);
        const { status } = (await readJsonBody(req) ?? {}) as { status?: unknown };
        return send(200, await createReportStore(database()).setStatus(match[1], status));
      }
      if (method === 'POST' && path === '/api/route') {
        requireSameOrigin(req, false);
        const { from, to, profile = 'wheelchair' } = (await readJsonBody(req) ?? {}) as {
          from?: { lat?: unknown; lng?: unknown }; to?: { lat?: unknown; lng?: unknown }; profile?: unknown;
        };
        if (!from || !to || !inPisa(from.lat, from.lng) || !inPisa(to.lat, to.lng)) {
          throw new HttpError(400, 'Partenza e destinazione devono trovarsi a Pisa.');
        }
        if (profile !== 'wheelchair' && profile !== 'foot') throw new HttpError(400, 'Profilo di percorso non valido.');
        const [a, b] = [from as { lat: number; lng: number }, to as { lat: number; lng: number }];
        return send(200, profile === 'foot' ? await getFootRoute(a, b) : await getRoute(a, b, env));
      }
      if (method === 'GET' && path === '/api/geocode') {
        const geocode = createGeocoder({ env, db: database(), features: osm.features });
        return send(200, await geocode(url.searchParams.get('q') ?? ''));
      }
      throw new HttpError(404, 'Risorsa non trovata.');
    } catch (error) {
      if (error instanceof HttpError) return send(error.status, { error: error.message });
      // Provider URLs, request headers and credentials must never reach the response or logs.
      console.error('AccessGo API request failed', error instanceof Error ? error.name : 'UnknownError');
      return send(500, { error: 'Errore interno. Riprova.' });
    }
  };
}
