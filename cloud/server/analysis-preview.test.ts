import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { analysisDescription, reserveAnalysisSlot } from './analysis-preview.ts';
import { testDatabase } from './test-d1.ts';

let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => { database.sqlite.close(); vi.useRealTimers(); });

describe('analysis preview validation', () => {
  it.each([null, [], 'un gradino alto', {}, { description: 42 }, { description: '  corto  ' }])('rejects missing or short text: %j', (input) => {
    expect(() => analysisDescription(input)).toThrow('almeno 10 caratteri');
  });

  it('bounds the raw input, trims valid text, and ignores location/category/identity fields', () => {
    expect(analysisDescription({ description: '  Un gradino alto.  ', lat: 0, category: 'fake', userId: 'fake' })).toBe('Un gradino alto.');
    expect(analysisDescription({ description: 'a'.repeat(1000) })).toHaveLength(1000);
    expect(() => analysisDescription({ description: 'a'.repeat(1001) })).toThrow('massimo 1000');
    expect(() => analysisDescription({ description: `${' '.repeat(990)}un gradino alto` })).toThrow('massimo 1000');
  });
});

describe('shared preview limiter', () => {
  it('atomically permits one concurrent attempt and persists only its next timestamp', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    const results = await Promise.allSettled(Array.from({ length: 8 }, () => reserveAnalysisSlot(database.db)));
    expect(results.filter((result) => result.status === 'fulfilled')).toHaveLength(1);
    for (const result of results) {
      if (result.status === 'rejected') expect(result.reason).toMatchObject({ status: 429 });
    }
    expect(database.sqlite.prepare('SELECT * FROM provider_limits').all()).toEqual([
      { key: 'gemma-analysis-preview', next_at: 15_000 },
    ]);
  });

  it('reopens precisely after five seconds and does not interfere with geocoding limits', async () => {
    vi.useFakeTimers();
    vi.setSystemTime(10_000);
    database.sqlite.prepare('INSERT INTO provider_limits (key, next_at) VALUES (?, ?)').run('nominatim', 99_000);
    await reserveAnalysisSlot(database.db);
    vi.setSystemTime(14_999);
    await expect(reserveAnalysisSlot(database.db)).rejects.toMatchObject({ status: 429 });
    vi.setSystemTime(15_000);
    await expect(reserveAnalysisSlot(database.db)).resolves.toBeUndefined();
    expect(database.sqlite.prepare('SELECT next_at FROM provider_limits WHERE key = ?').get('nominatim')?.next_at).toBe(99_000);
    expect(database.sqlite.prepare('SELECT next_at FROM provider_limits WHERE key = ?').get('gemma-analysis-preview')?.next_at).toBe(20_000);
  });

  it('fails closed when storage is absent or fails without leaking database details', async () => {
    await expect(reserveAnalysisSlot()).rejects.toMatchObject({ status: 503 });
    const broken = { prepare() { throw new Error('private database detail'); } } as unknown as D1Database;
    await expect(reserveAnalysisSlot(broken)).rejects.toMatchObject({ status: 503, message: 'Analisi temporaneamente non disponibile. Riprova più tardi.' });
  });
});
