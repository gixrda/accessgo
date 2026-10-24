import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createReportStore } from './reports.ts';
import { testDatabase } from './test-d1.ts';

const input = { lat: 43.718, lng: 10.401, description: 'Un gradino alto blocca il passaggio.' };
let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => { database.sqlite.close(); vi.unstubAllGlobals(); });

describe('durable reports', () => {
  it('persists a validated model interpretation but never model-provided verification or credentials', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
      category: 'steps', evidence: 'gradino alto', summary: 'Gradino alto che blocca il passaggio.',
      obstacle: 'gradino', severity: 'unknown', missing_info: ['Altezza del gradino'],
      status: 'verified', lat: 0, lng: 0,
    }) }] } }] })));
    const saved = await createReportStore(database.db).create(input, { GEMINI_API_KEY: 'test-secret-key' }, 'private-owner');
    expect(saved).toMatchObject({ status: 'unverified', lat: input.lat, lng: input.lng, interpretation: {
      engine: 'gemma', model: 'gemma-4-26b-a4b-it', category: 'steps',
    } });
    expect((await createReportStore(database.db).all())[0]).toEqual(saved);
    const stored = JSON.stringify(database.sqlite.prepare('SELECT payload FROM reports').get());
    expect(stored).not.toContain('test-secret-key');
    expect(saved.interpretation).not.toHaveProperty('status');
  });

  it('still saves an unverified report with an honest fallback after an API authentication failure', async () => {
    const fetchMock = vi.fn(async () => new Response('private upstream error', { status: 403 }));
    vi.stubGlobal('fetch', fetchMock);
    const saved = await createReportStore(database.db).create(input, { GEMINI_API_KEY: 'test-secret-key' }, 'a');
    expect(saved).toMatchObject({ status: 'unverified', interpretation: { engine: 'fallback', category: 'steps' } });
    expect(saved.interpretation.note).toMatch(/autorizzazione/);
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(JSON.stringify(saved)).not.toContain('private upstream error');
  });

  it('saves a report across store instances without publishing the owner or accepting a verified status', async () => {
    const saved = await createReportStore(database.db).create({ ...input, status: 'verified', category: 'kerb' }, {}, 'private-owner');
    expect(saved.status).toBe('unverified');
    expect(saved.category).toBe('kerb');
    expect(saved.categorySource).toBe('user');
    expect(saved.interpretation.engine).toBe('fallback');
    const readback = await createReportStore(database.db).all();
    expect(readback).toEqual([saved]);
    expect(JSON.stringify(readback)).not.toContain('private-owner');
    expect(database.sqlite.prepare('SELECT user_id FROM reports').get()?.user_id).toBe('private-owner');
  });

  it('atomically rejects a duplicate even when submissions start together', async () => {
    const store = createReportStore(database.db);
    const results = await Promise.allSettled([
      store.create(input, {}, 'a'), store.create(input, {}, 'a'),
    ]);
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(1);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 409 } });
    expect(await store.all()).toHaveLength(1);
  });

  it('caps concurrent submissions at five per user and allows another user', async () => {
    const store = createReportStore(database.db);
    const results = await Promise.allSettled(Array.from({ length: 6 }, (_, index) =>
      store.create({ ...input, description: `${input.description} Punto ${index}` }, {}, 'a')));
    expect(results.filter((r) => r.status === 'fulfilled')).toHaveLength(5);
    expect(results.find((r) => r.status === 'rejected')).toMatchObject({ reason: { status: 429 } });
    await expect(store.create({ ...input, description: `${input.description} Altro utente` }, {}, 'b')).resolves.toHaveProperty('id');
  });

  it('rejects missing identity and invalid locations before writing', async () => {
    const store = createReportStore(database.db);
    await expect(store.create(input, {}, '')).rejects.toMatchObject({ status: 401 });
    await expect(store.create({ ...input, lat: 0 }, {}, 'a')).rejects.toMatchObject({ status: 400 });
    expect(await store.all()).toHaveLength(0);
  });

  it('never publishes absence or removal, even with a manually supplied category, or resolves an existing report', async () => {
    const store = createReportStore(database.db);
    const existing = await store.create(input, {}, 'a');
    for (const description of ['Non ci sono più gradini.', 'Il gradino è stato rimosso ieri; ora il passaggio è libero.']) {
      for (const category of [undefined, 'steps']) {
        await expect(store.create({ ...input, description, category }, {}, 'b')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/non segnala un ostacolo attuale/) });
      }
    }
    expect(await store.all()).toEqual([existing]);
    expect(existing.status).toBe('unverified');
  });

  it('requires clarification or an explicit obstacle category before publishing an unclear report', async () => {
    const store = createReportStore(database.db);
    const description = 'Non riesco a passare qui.';
    await expect(store.create({ ...input, description }, {}, 'a')).rejects.toMatchObject({ status: 400, message: expect.stringMatching(/Descrivi meglio/) });
    expect(await store.all()).toHaveLength(0);
    const saved = await store.create({ ...input, description, category: 'steps' }, {}, 'a');
    expect(saved).toMatchObject({ category: 'steps', categorySource: 'user', status: 'unverified', interpretation: { category: 'unclear' } });
  });

  it('applies the no-obstacle guard to an actual model-shaped result, not just fallback classification', async () => {
    const description = 'Non ci sono più gradini.';
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({ candidates: [{ finishReason: 'STOP', content: { parts: [{ text: JSON.stringify({
      category: 'no_obstacle', evidence: description, summary: 'I gradini descritti non sono più presenti.',
      obstacle: null, severity: 'unknown', missing_info: [],
    }) }] } }] })));
    await expect(createReportStore(database.db).create({ ...input, description, category: 'steps' }, { GEMINI_API_KEY: 'test-key' }, 'a')).rejects.toMatchObject({ status: 400 });
    expect(database.sqlite.prepare('SELECT COUNT(*) AS n FROM reports').get()?.n).toBe(0);
  });

  it('rejects analysis-only categories as manual public marker categories', async () => {
    for (const category of ['no_obstacle', 'unclear']) {
      await expect(createReportStore(database.db).create({ ...input, category }, {}, 'a')).rejects.toMatchObject({ status: 400, message: 'Categoria non valida.' });
    }
  });

  it('reads old stored other interpretations without migration or reinterpretation', async () => {
    const store = createReportStore(database.db);
    const saved = await store.create(input, {}, 'a');
    const legacy = { ...saved, category: 'other', interpretation: { ...saved.interpretation, category: 'other', obstacle: null } };
    database.sqlite.prepare('UPDATE reports SET payload = ? WHERE id = ?').run(JSON.stringify(legacy), saved.id);
    expect(await store.all()).toEqual([legacy]);
  });

  it('updates moderation status durably with a timestamp and validates missing IDs', async () => {
    const store = createReportStore(database.db);
    const saved = await store.create(input, {}, 'a');
    await expect(store.setStatus(saved.id, 'safe')).rejects.toMatchObject({ status: 400 });
    await expect(store.setStatus('missing', 'resolved')).rejects.toMatchObject({ status: 404 });
    const changed = await store.setStatus(saved.id, 'resolved');
    expect(changed.status).toBe('resolved');
    expect(changed.statusUpdatedAt).toBeTypeOf('string');
    expect((await createReportStore(database.db).all())[0]).toEqual(changed);
  });
});
