import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { createGeocoder, normalizeQuery } from './geocoding';
import type { OsmFeature } from '../shared/types';

// Use actual SQLite for UPSERT/RETURNING and retention semantics; the small
// adapter only emulates D1's asynchronous API, not Cloudflare transport.
class TestD1 {
  sql = new DatabaseSync(':memory:');
  constructor() {
    this.sql.exec('CREATE TABLE geocode_cache (key TEXT PRIMARY KEY, payload TEXT NOT NULL, expires INTEGER NOT NULL); CREATE TABLE provider_limits (key TEXT PRIMARY KEY, next_at INTEGER NOT NULL);');
  }
  prepare(query: string) {
    const statement = this.sql.prepare(query);
    let bindings: SQLInputValue[] = [];
    const prepared = {
      bind(...values: SQLInputValue[]) { bindings = values; return prepared; },
      async first() { return statement.get(...bindings) ?? null; },
      async run() { statement.run(...bindings); return { success: true }; },
      runSync() { statement.run(...bindings); },
    };
    return prepared;
  }
  async batch(statements: ReturnType<TestD1['prepare']>[]) {
    this.sql.exec('BEGIN');
    try { statements.forEach((s) => s.runSync()); this.sql.exec('COMMIT'); }
    catch (e) { this.sql.exec('ROLLBACK'); throw e; }
    return statements.map(() => ({ success: true }));
  }
  binding() { return this as unknown as D1Database; }
}
const features: OsmFeature[] = [
  { id: 'way/1', source: 'osm', scope: 'path', kind: 'surface', certainty: 'info', label: 'Pavimentazione', name: 'Piazza dei Cavalieri', tags: { highway: 'pedestrian' }, geometry: { type: 'line', coords: [[43.719, 10.4], [43.7191, 10.4001]] } },
  { id: 'way/2', source: 'osm', scope: 'path', kind: 'surface', certainty: 'info', label: 'Pavimentazione', name: 'Via Roma', tags: { highway: 'footway' }, geometry: { type: 'line', coords: [[43.72, 10.395], [43.721, 10.396]] } },
];
const providerPlace = { display_name: 'Via Roma, Pisa, Italia', lat: '43.72', lon: '10.395' };
const response = (value: unknown) => new Response(JSON.stringify(value), { headers: { 'Content-Type': 'application/json' } });

describe('cloud geocoding', () => {
  let db: TestD1;
  let now: number;
  beforeEach(() => {
    db = new TestD1(); now = 1_800_000_000_000;
    vi.spyOn(Date, 'now').mockImplementation(() => now);
  });
  afterEach(() => { vi.restoreAllMocks(); db.sql.close(); });
  const geocoder = (db: TestD1, fetcher: typeof fetch) => createGeocoder({ env: {}, db: db.binding(), features, fetcher });

  it('offers real local piazza vertices without a provider or D1 cache request', async () => {
    const fetcher = vi.fn<typeof fetch>();
    const values = await geocoder(db, fetcher)('piazza');
    expect(values).toHaveLength(1);
    expect(values[0].label).toContain('punto indicativo da OSM locale');
    expect([43.719, 43.7191]).toContain(values[0].lat);
    expect(fetcher).not.toHaveBeenCalled();
    expect(normalizeQuery('  Via   dell’Orto,  Pisa, ')).toBe("Via dell'Orto, Pisa");
  });

  it('shares a successful cache across separate geocoder instances and honors bounds', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([
      providerPlace, providerPlace,
      { display_name: 'Outside Pisa', lat: '44', lon: '10.395' },
      { display_name: 'Broken', lat: 'NaN', lon: '10.395' },
    ]));
    const first = await geocoder(db, fetcher)('Via Roma');
    const second = await geocoder(db, fetcher)('  VIA  ROMA  ');
    expect(first).toEqual([{ label: providerPlace.display_name, lat: 43.72, lng: 10.395 }]);
    expect(second).toEqual(first);
    expect(fetcher).toHaveBeenCalledTimes(1);
    const [url, options] = fetcher.mock.calls[0];
    expect(new URL(String(url)).searchParams.get('bounded')).toBe('1');
    expect(new URL(String(url)).searchParams.get('q')).toBe('Via Roma, Pisa');
    expect((options?.headers as Record<string, string>)['User-Agent']).toContain('accessgo-pisa-marco.xyxzwb.chatgpt.site');
    const row = db.sql.prepare('SELECT expires FROM geocode_cache').get();
    expect(row?.expires).toBe(now + 86_400_000);
  });

  it('atomically rejects a second Worker while the first request is still running', async () => {
    let complete!: (value: Response) => void;
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() => new Promise((resolve) => { complete = resolve; }));
    const running = geocoder(db, fetcher)('Via Roma');
    await vi.waitFor(() => expect(fetcher).toHaveBeenCalledTimes(1));
    now += 20_000; // Still locked even though far beyond one-second start spacing.
    await expect(geocoder(db, fetcher)('Via Santa Maria')).rejects.toMatchObject({ status: 429 });
    complete(response([providerPlace]));
    await running;
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1_999;
    await expect(geocoder(db, fetcher)('Via Santa Maria')).rejects.toMatchObject({ status: 429 });
    now += 1;
    const nextFetcher = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    await geocoder(db, nextFetcher)('Via Santa Maria');
    expect(nextFetcher).toHaveBeenCalledTimes(1);
  });

  it('does not silently replace a missing house number with a generic street vertex', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([providerPlace,
      { ...providerPlace, address: { house_number: '12' } },
    ]));
    expect(await geocoder(db, fetcher)('Via Roma 10')).toEqual([]);
    const row = db.sql.prepare('SELECT expires FROM geocode_cache').get();
    expect(row?.expires).toBe(now + 600_000);
  });

  it('returns a provider-confirmed matching house number', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([
      { ...providerPlace, display_name: '10, Via Roma, Pisa', address: { house_number: '10' } },
    ]));
    expect(await geocoder(db, fetcher)('Via Roma 10')).toEqual([{ label: '10, Via Roma, Pisa', lat: 43.72, lng: 10.395 }]);
  });

  it('uses a clearly labelled local street only after a successful empty provider response', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([]));
    const results = await geocoder(db, fetcher)('Via Roma');
    expect(results[0].label).toContain('punto indicativo da OSM locale');
    expect([43.72, 43.721]).toContain(results[0].lat);
  });

  it('does not cache errors or disguise provider failure as local search success', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response('', { status: 429 }));
    await expect(geocoder(db, fetcher)('Via Roma')).rejects.toMatchObject({ status: 503 });
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM geocode_cache').get()?.n).toBe(0);
    expect(db.sql.prepare('SELECT next_at FROM provider_limits').get()?.next_at).toBe(now + 2_000);
  });

  it('expires cached empty results after ten minutes', async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async () => response([]));
    await geocoder(db, fetcher)('Via Non presente 123');
    now += 599_999;
    await geocoder(db, fetcher)('Via Non presente 123');
    expect(fetcher).toHaveBeenCalledTimes(1);
    now += 1;
    await geocoder(db, fetcher)('Via Non presente 123');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('keeps the persistent cache within 200 entries after a write', async () => {
    const insert = db.sql.prepare('INSERT INTO geocode_cache VALUES (?, ?, ?)');
    for (let i = 0; i < 205; i++) insert.run(`seed-${i}`, '[]', now + 600_000);
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(response([providerPlace]));
    await geocoder(db, fetcher)('Via Roma');
    expect(db.sql.prepare('SELECT COUNT(*) AS n FROM geocode_cache').get()?.n).toBe(200);
    expect(db.sql.prepare('SELECT payload FROM geocode_cache WHERE key LIKE ?').get('%|via roma')?.payload).toContain('Via Roma');
  });

  it('fails closed when the shared database cannot enforce the provider limit', async () => {
    const fetcher = vi.fn<typeof fetch>();
    db.sql.exec('DROP TABLE provider_limits');
    await expect(geocoder(db, fetcher)('Via Roma')).rejects.toMatchObject({ status: 503 });
    expect(fetcher).not.toHaveBeenCalled();
  });
});
