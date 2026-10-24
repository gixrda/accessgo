import { inPisa, PISA_BOUNDS, type GeocodeResult, type OsmFeature } from '../shared/types';
import { HttpError, type Env } from './errors';

const DEFAULT_SEARCH_URL = 'https://nominatim.openstreetmap.org/search';
const UNAVAILABLE = 'Ricerca indirizzi temporaneamente non disponibile. Riprova oppure seleziona il punto sulla mappa.';
const GENERIC = /^(?:via|viale|piazza|piazzale|largo|vicolo|lungarno|borgo|corso)$/;
const BUSY = 'Ricerca indirizzi momentaneamente occupata. Attendi qualche secondo e riprova.';
const USER_AGENT = 'AccessGo/0.1 (+https://accessogo.xyxzwb.chatgpt.site)';
const PROVIDER_KEY = 'nominatim';
// Lock the entire request, then leave a safety gap after completion. This works
// across isolates and includes provider failures; no burst of delayed jobs.
const LEASE_MS = 30_000;
const GAP_MS = 2_000;
const REQUEST_TIMEOUT_MS = 10_000;
const MAX_COOLDOWN_WAIT_MS = 2_200;

export function normalizeQuery(query: string): string {
  return query.normalize('NFKC').replace(/[’‘]/g, "'").replace(/\s+/g, ' ').trim()
    .replace(/\s*,\s*/g, ', ').replace(/(?:,\s*)+$/, '');
}

function localQuery(query: string): string {
  return query.replace(/(?:,?\s+)(?:pisa|italia|italy)$/i, '')
    .replace(/(?:,?\s+)(?:pisa|italia|italy)$/i, '').trim();
}

function folded(s: string): string {
  return normalizeQuery(s).toLocaleLowerCase('it').normalize('NFD').replace(/\p{M}/gu, '');
}

/** Search aliases change only the text sent to OSM, never supply coordinates. */
function searchQuery(input: string): { query: string; campusArea: boolean } {
  // Preserve "di Pisa" when it is part of a landmark's name.
  const q = folded(input).replace(/,?\s+(?:italia|italy)$/, '').replace(/,\s*pisa$/, '');
  if (/^(?:polo\s*f|polo fibonacci|fibonacci)$/.test(q)) {
    // UniPi identifies Polo Fibonacci as Area Pontecorvo. The result remains
    // an area, not a claimed accessible entrance to a particular building.
    return { query: 'Polo Fibonacci', campusArea: true };
  }
  if (/^(?:torre(?: pendente)?(?: di pisa)?|leaning tower(?: of pisa)?|pisa leaning tower|比萨斜塔|比薩斜塔|斜塔)$/.test(q)) {
    return { query: 'Torre pendente di Pisa', campusArea: false };
  }
  if (/^(?:piazza dei miracoli|square of miracles|奇迹广场|奇蹟廣場)$/.test(q)) {
    return { query: 'Piazza del Duomo', campusArea: false };
  }
  if (/^(?:stazione(?: centrale| ferroviaria)?|pisa (?:central|train) station|central station|比萨中央火车站|比薩中央火車站|比萨火车站|中央车站)$/.test(q)) {
    return { query: 'Pisa Centrale', campusArea: false };
  }
  return { query: input, campusArea: false };
}

/** Un civico esplicito non può essere sostituito silenziosamente da un punto generico della via. */
function requestedHouseNumber(query: string): string | null {
  const q = localQuery(query);
  const suffix = /(?:\s|,)(\d+[a-z]?(?:[/-][\da-z]+)?)$/i.exec(q)?.[1];
  const prefix = /^(\d+[a-z]?(?:[/-][\da-z]+)?)\s+/i.exec(q)?.[1];
  const value = suffix ?? prefix;
  return value ? value.replace(/\s/g, '').toLowerCase() : null;
}

/** Nomi, punti e vertici dal dataset OSM: mai ingressi o civici dedotti dal nome. */
export function findLocalPlaces(features: OsmFeature[], query: string): GeocodeResult[] {
  const q = folded(localQuery(query));
  if (!q || /\d/.test(q)) return [];
  const tokens = q.split(/[\s,]+/).filter(Boolean);
  const grouped = new Map<string, { name: string; points: [number, number][]; place: boolean }>();
  for (const f of features) {
    if (!f.name || (f.scope !== 'place' && (f.scope !== 'path' || !f.tags.highway))) continue;
    const name = folded(f.name);
    if (!tokens.every((token) => name.split(/[\s'/-]+/).some((word) => word.startsWith(token)))) continue;
    const points = (f.geometry.type === 'point' ? [f.geometry.coords] : f.geometry.coords)
      .filter(([lat, lng]) => inPisa(lat, lng));
    if (!points.length) continue;
    const key = `${f.scope}:${name}`;
    const entry = grouped.get(key);
    if (entry) entry.points.push(...points);
    else grouped.set(key, { name: f.name, points: [...points], place: f.scope === 'place' });
  }
  return [...grouped.values()].sort((a, b) => a.name.localeCompare(b.name, 'it')).slice(0, 8).map(({ name, points, place }) => {
    // Scegli un vertice OSM vicino al centro dei tratti omonimi, senza generare nuove coordinate.
    const lat = points.reduce((sum, p) => sum + p[0], 0) / points.length;
    const lng = points.reduce((sum, p) => sum + p[1], 0) / points.length;
    const distance = (p: [number, number]) => (p[0] - lat) ** 2 + ((p[1] - lng) * Math.cos(lat * Math.PI / 180)) ** 2;
    const point = points.reduce((best, p) => distance(p) < distance(best) ? p : best);
    return { label: `${name}, Pisa · punto indicativo da OSM locale${place ? ' · ingresso da verificare' : ''}`, lat: point[0], lng: point[1] };
  });
}

interface GeocodingOptions {
  env: Env;
  db: D1Database;
  features: OsmFeature[];
  fetcher?: typeof fetch;
  wait?: (ms: number) => Promise<void>;
}

function cachedResults(payload: string): GeocodeResult[] | null {
  try {
    const value: unknown = JSON.parse(payload);
    if (!Array.isArray(value) || value.length > 8) return null;
    if (!value.every((r) => r && typeof r === 'object' && typeof r.label === 'string'
      && r.label.trim() && typeof r.lat === 'number' && typeof r.lng === 'number' && inPisa(r.lat, r.lng))) return null;
    return value as GeocodeResult[];
  } catch { return null; }
}

export function createGeocoder({ env, db, features, fetcher = (...args) => fetch(...args), wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms)) }: GeocodingOptions) {
  const pending = new Map<string, Promise<GeocodeResult[]>>();
  const local = (q: string) => findLocalPlaces(features, q);

  async function acquireLease(): Promise<number> {
    // One bounded wait absorbs the short cooldown between sequential place
    // searches. A request already in flight keeps its full cross-Worker lock.
    for (let attempt = 0; attempt < 2; attempt++) {
      const now = Date.now(), leaseUntil = now + LEASE_MS;
      const acquired = await db.prepare(`
        INSERT INTO provider_limits (key, next_at) VALUES (?, ?)
        ON CONFLICT(key) DO UPDATE SET next_at = excluded.next_at
        WHERE provider_limits.next_at <= ?
        RETURNING next_at
      `).bind(PROVIDER_KEY, leaseUntil, now).first<{ next_at: number }>();
      if (acquired) return leaseUntil;
      if (attempt === 1) break;
      const row = await db.prepare('SELECT next_at FROM provider_limits WHERE key = ?')
        .bind(PROVIDER_KEY).first<{ next_at: number }>();
      if (!row) break;
      const delay = Math.max(0, row.next_at - Date.now());
      if (!Number.isFinite(delay) || delay > MAX_COOLDOWN_WAIT_MS) break;
      await wait(delay + 10);
    }
    throw new HttpError(429, BUSY);
  }

  async function remote(query: string): Promise<GeocodeResult[]> {
    const url = new URL(env.NOMINATIM_SEARCH_URL || DEFAULT_SEARCH_URL);
    if (!['https:', 'http:'].includes(url.protocol)) throw new HttpError(503, UNAVAILABLE);
    const [s, w, n, e] = PISA_BOUNDS;
    const contextual = /\bpisa\b/i.test(query) ? query : `${query}, Pisa`;
    for (const [key, value] of Object.entries({
      q: contextual, format: 'jsonv2', limit: '8', viewbox: `${w},${n},${e},${s}`,
      bounded: '1', countrycodes: 'it', 'accept-language': 'it', addressdetails: '1',
    })) url.searchParams.set(key, value);

    // SQLite makes the conflict predicate and update atomic. A per-process
    // queue would not enforce the provider's app-wide limit on Workers.
    const leaseUntil = await acquireLease();
    try {
      // Don't start if the DB round trip consumed most of our lease.
      if (Date.now() > leaseUntil - REQUEST_TIMEOUT_MS - GAP_MS) throw new HttpError(429, BUSY);
      const res = await fetcher(url.toString(), {
        headers: { 'User-Agent': USER_AGENT }, signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
      });
      if (res.status === 429) throw new HttpError(503, BUSY);
      if (!res.ok) throw new HttpError(503, UNAVAILABLE);
      const json: unknown = await res.json();
      if (!Array.isArray(json)) throw new HttpError(503, UNAVAILABLE);
      const number = requestedHouseNumber(query);
      const seen = new Set<string>();
      const results: GeocodeResult[] = [];
      for (const value of json) {
        if (!value || typeof value !== 'object') continue;
        const r = value as Record<string, unknown>;
        if (typeof r.display_name !== 'string' || !r.display_name.trim()) continue;
        if (!['string', 'number'].includes(typeof r.lat) || !['string', 'number'].includes(typeof r.lon)) continue;
        const lat = Number(r.lat), lng = Number(r.lon);
        if (!inPisa(lat, lng)) continue;
        if (number) {
          const address = r.address as { house_number?: unknown } | undefined;
          if (typeof address?.house_number !== 'string' || address.house_number.replace(/\s/g, '').toLowerCase() !== number) continue;
        }
        const id = `${r.display_name}:${lat}:${lng}`;
        if (seen.has(id)) continue;
        seen.add(id);
        results.push({ label: r.display_name, lat, lng });
        if (results.length === 8) break;
      }
      return results;
    } finally {
      // Compare-and-set cannot overwrite a newer lease if this request stalls.
      // On DB failure, the original 30s lease remains: fail closed, never burst.
      await db.prepare('UPDATE provider_limits SET next_at = ? WHERE key = ? AND next_at = ?')
        .bind(Date.now() + GAP_MS, PROVIDER_KEY, leaseUntil).run();
    }
  }

  return async function geocode(input: string): Promise<GeocodeResult[]> {
    const normalized = normalizeQuery(input);
    if (normalized.length < 2 || (normalized.length < 3 && !/\p{Script=Han}/u.test(normalized))) throw new HttpError(400, 'Scrivi almeno 3 caratteri.');
    if (normalized.length > 200) throw new HttpError(400, 'Indirizzo troppo lungo (massimo 200 caratteri).');
    const { query, campusArea } = searchQuery(normalized);
    const decorate = (results: GeocodeResult[]) => campusArea
      ? results.map((r) => ({ ...r, label: `Area del Polo Fibonacci · ${r.label} · ingresso da verificare` })) : results;
    const localMatches = () => decorate(local(campusArea ? 'Largo Bruno Pontecorvo' : query));
    // A generic road type offers real local names without a provider request.
    if (GENERIC.test(folded(localQuery(query)))) return local(query);
    const key = `${env.NOMINATIM_SEARCH_URL || DEFAULT_SEARCH_URL}|${campusArea ? 'area:' : ''}${folded(query)}`;
    const existing = pending.get(key);
    if (existing) return existing;
    const task = (async () => {
      try {
        const hit = await db.prepare('SELECT payload, expires FROM geocode_cache WHERE key = ? AND expires > ?')
          .bind(key, Date.now()).first<{ payload: string; expires: number }>();
        if (hit) {
          const results = cachedResults(hit.payload);
          if (results) return results;
        }
        const found = await remote(query);
        const results = found.length ? decorate(found) : localMatches();
        const now = Date.now();
        // D1 batch is transactional: every successful write also bounds the cache.
        await db.batch([
          db.prepare('INSERT INTO geocode_cache (key, payload, expires) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET payload = excluded.payload, expires = excluded.expires')
            .bind(key, JSON.stringify(results), now + (results.length ? 86_400_000 : 600_000)),
          db.prepare('DELETE FROM geocode_cache WHERE expires <= ?').bind(now),
          db.prepare('DELETE FROM geocode_cache WHERE key IN (SELECT key FROM geocode_cache ORDER BY expires DESC, key LIMIT -1 OFFSET 200)'),
        ]);
        return results;
      } catch (error) {
        // A provider outage must not disable names that actually exist in our
        // downloaded OSM dataset. Expose the reduced source in every label;
        // never cache outage fallback as a successful provider response.
        const fallback = localMatches();
        if (fallback.length) return fallback.map((r) => ({ ...r, label: `${r.label} · ricerca online non disponibile` }));
        if (error instanceof HttpError) throw error;
        throw new HttpError(503, UNAVAILABLE);
      }
    })();
    pending.set(key, task);
    try { return await task; } finally { pending.delete(key); }
  };
}
