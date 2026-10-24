import { inPisa, REPORT_CATEGORIES, type ReportCategory } from '../../shared/types.ts';

const STORAGE_KEY = 'accessgo:report-sign-in-draft:v1';
const MAX_AGE_MS = 2 * 60 * 60 * 1000;

export interface StoredReportDraft {
  point: { lat: number; lng: number } | null;
  description: string;
  category: ReportCategory | '';
}

/** Only save when the user chooses sign-in; this draft never leaves the current tab. */
export function saveReportDraftForSignIn(draft: StoredReportDraft): boolean {
  try {
    window.sessionStorage.setItem(STORAGE_KEY, JSON.stringify({
      point: draft.point,
      description: draft.description,
      category: draft.category,
      savedAt: Date.now(),
    }));
    return true;
  } catch { return false; }
}

export function readReportSignInDraft(): StoredReportDraft | null {
  try {
    const raw = window.sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const draft = JSON.parse(raw);
    if (!draft || typeof draft !== 'object' || typeof draft.savedAt !== 'number'
      || !Number.isFinite(draft.savedAt) || draft.savedAt > Date.now() + 60_000
      || Date.now() - draft.savedAt > MAX_AGE_MS
      || typeof draft.description !== 'string' || draft.description.length > 1000
      || (draft.category !== '' && !REPORT_CATEGORIES.includes(draft.category))
      || (draft.point !== null && (!draft.point || !inPisa(draft.point.lat, draft.point.lng)))) {
      clearReportSignInDraft();
      return null;
    }
    return {
      point: draft.point === null ? null : { lat: draft.point.lat, lng: draft.point.lng },
      description: draft.description,
      category: draft.category,
    };
  } catch { return null; }
}

export function clearReportSignInDraft() {
  try { window.sessionStorage.removeItem(STORAGE_KEY); } catch { /* Browser storage may be disabled. */ }
}
