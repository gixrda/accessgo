import { readFile } from 'node:fs/promises';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { inPisa, PISA_BOUNDS, type GeocodeResult, type ServerStatus } from '../shared/types.ts';
import { aiProvider } from './ai.ts';
import { HttpError, USER_AGENT, type Env } from './errors.ts';
import { createReportStore } from './reports.ts';
import { getFootRoute, getRoute } from './routing.ts';

export interface ApiOptions {
  env: Env;
  reportsFile: string;
  osmFile: string;
}

/** Restituisce un handler che gestisce /api/* e risponde false per tutto il resto. */
export function createApi({ env, reportsFile, osmFile }: ApiOptions) {
  const reports = createReportStore(reportsFile);
  const geocodeCache = new Map<string, GeocodeResult[]>();
  let lastNominatim = 0;

  async function geocode(q: string): Promise<GeocodeResult[]> {
    const key = q.trim().toLowerCase();
    if (key.length < 3) throw new HttpError(400, 'Scrivi almeno 3 caratteri.');
    const hit = geocodeCache.get(key);
    if (hit) return hit;
    // Policy Nominatim: massimo 1 richiesta al secondo, User-Agent identificativo, niente autocompletamento.
    const wait = lastNominatim + 1000 - Date.now();
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    lastNominatim = Date.now();
    const [s, w, n, e] = PISA_BOUNDS;
    const url = `https://nominatim.openstreetmap.org/search?${new URLSearchParams({
      q, format: 'jsonv2', limit: '5', viewbox: `${w},${n},${e},${s}`, bounded: '1', 'accept-language': 'it',
    })}`;
    const res = await fetch(url, { headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(10_000) })
      .catch(() => { throw new HttpError(503, 'Ricerca indirizzi non disponibile. Seleziona il punto sulla mappa.'); });
    if (!res.ok) throw new HttpError(503, 'Ricerca indirizzi non disponibile. Seleziona il punto sulla mappa.');
    const json = await res.json() as { display_name: string; lat: string; lon: string }[];
    const results = json.map((r) => ({ label: r.display_name, lat: Number(r.lat), lng: Number(r.lon) }));
    geocodeCache.set(key, results);
    return results;
  }

  return async function handle(req: IncomingMessage, res: ServerResponse): Promise<boolean> {
    const url = new URL(req.url ?? '/', 'http://localhost');
    if (!url.pathname.startsWith('/api/')) return false;
    const path = url.pathname;
    const method = req.method ?? 'GET';
    try {
      if (method === 'GET' && path === '/api/status') {
        const ai = aiProvider(env);
        const status: ServerStatus = {
          routing: env.ORS_API_KEY ? 'openrouteservice' : 'valhalla',
          ai: ai.kind, ...(ai.model ? { aiModel: ai.model } : {}),
          admin: Boolean(env.ADMIN_TOKEN),
        };
        return send(res, 200, status);
      }
      if (method === 'GET' && path === '/api/osm') {
        res.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=300' });
        res.end(await readFile(osmFile));
        return true;
      }
      if (method === 'GET' && path === '/api/reports') return send(res, 200, await reports.all());
      if (method === 'POST' && path === '/api/reports') return send(res, 201, await reports.create(await body(req), env));

      const m = /^\/api\/reports\/([\w-]+)$/.exec(path);
      if (method === 'PATCH' && m) {
        if (!env.ADMIN_TOKEN) throw new HttpError(403, 'Modifica degli stati non abilitata su questo server.');
        if (req.headers['x-admin-token'] !== env.ADMIN_TOKEN) throw new HttpError(401, 'Codice moderatore non valido.');
        const { status } = (await body(req) ?? {}) as { status?: unknown };
        return send(res, 200, await reports.setStatus(m[1], status));
      }
      if (method === 'POST' && path === '/api/route') {
        const { from, to, profile = 'wheelchair' } = (await body(req) ?? {}) as {
          from?: { lat?: unknown; lng?: unknown }; to?: { lat?: unknown; lng?: unknown }; profile?: unknown;
        };
        if (!from || !to || !inPisa(from.lat, from.lng) || !inPisa(to.lat, to.lng)) {
          throw new HttpError(400, 'Partenza e destinazione devono trovarsi a Pisa.');
        }
        if (profile !== 'wheelchair' && profile !== 'foot') throw new HttpError(400, 'Profilo di percorso non valido.');
        const [a, b] = [from as { lat: number; lng: number }, to as { lat: number; lng: number }];
        return send(res, 200, profile === 'foot' ? await getFootRoute(a, b) : await getRoute(a, b, env));
      }
      if (method === 'GET' && path === '/api/geocode') return send(res, 200, await geocode(url.searchParams.get('q') ?? ''));
      throw new HttpError(404, 'Risorsa non trovata.');
    } catch (e) {
      if (e instanceof HttpError) return send(res, e.status, { error: e.message });
      console.error(e);
      return send(res, 500, { error: 'Errore interno. Riprova.' });
    }
  };
}

function send(res: ServerResponse, status: number, data: unknown): true {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(data));
  return true;
}

async function body(req: IncomingMessage): Promise<unknown> {
  let size = 0;
  const chunks: Buffer[] = [];
  for await (const chunk of req) {
    size += (chunk as Buffer).length;
    if (size > 16_384) throw new HttpError(413, 'Richiesta troppo grande.');
    chunks.push(chunk as Buffer);
  }
  if (!chunks.length) return null;
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new HttpError(400, 'JSON non valido.'); }
}
