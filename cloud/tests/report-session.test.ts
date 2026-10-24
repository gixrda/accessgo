// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { readReportSignInDraft, saveReportDraftForSignIn } from '../src/lib/reportSession.ts';

beforeEach(() => { window.sessionStorage.clear(); });
afterEach(() => { vi.restoreAllMocks(); });

describe('sign-in report draft storage', () => {
  it('restores only valid draft fields and discards stale content', () => {
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now);
    const draft = { point: { lat: 43.72, lng: 10.4 }, description: 'Un gradino alto', category: 'steps' as const };
    expect(saveReportDraftForSignIn(draft)).toBe(true);
    expect(readReportSignInDraft()).toEqual(draft);
    vi.mocked(Date.now).mockReturnValue(now + 2 * 60 * 60 * 1000 + 1);
    expect(readReportSignInDraft()).toBeNull();
    expect(window.sessionStorage.length).toBe(0);
  });

  it('ignores coordinates outside Pisa and malformed storage', () => {
    saveReportDraftForSignIn({ point: { lat: 0, lng: 0 }, description: 'Un gradino alto', category: 'steps' });
    expect(readReportSignInDraft()).toBeNull();
    window.sessionStorage.setItem('accessgo:report-sign-in-draft:v1', '{broken');
    expect(readReportSignInDraft()).toBeNull();
  });

  it('still allows the app to load when browser storage is blocked', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new Error('Blocked'); });
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new Error('Blocked'); });
    expect(readReportSignInDraft()).toBeNull();
    expect(saveReportDraftForSignIn({ point: null, description: '', category: '' })).toBe(false);
  });
});
