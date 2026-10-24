import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createReportStore } from './reports.ts';
import { testDatabase } from './test-d1.ts';

const input = { lat: 43.718, lng: 10.401, description: 'Un gradino alto blocca il passaggio.' };
let database: ReturnType<typeof testDatabase>;
beforeEach(() => { database = testDatabase(); });
afterEach(() => database.sqlite.close());

describe('durable reports', () => {
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
