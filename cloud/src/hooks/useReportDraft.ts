import { useRef, useState } from 'react';
import type { Report, ReportCategory } from '../../shared/types.ts';
import { api } from '../api.ts';
import { clearReportSignInDraft, readReportSignInDraft } from '../lib/reportSession.ts';

type Point = { lat: number; lng: number };

/** Lives in App so navigation and map selection never discard a report draft. */
export function useReportDraft(onCreated: (report: Report) => void) {
  const [restoredDraft] = useState(readReportSignInDraft);
  const [point, setPointState] = useState<Point | null>(restoredDraft?.point ?? null);
  const [description, setDescriptionState] = useState(restoredDraft?.description ?? '');
  const [category, setCategoryState] = useState<ReportCategory | ''>(restoredDraft?.category ?? '');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Report | null>(null);
  const pending = useRef(false);
  const setPoint = (value: Point | null) => { if (!pending.current) setPointState(value); };
  const setDescription = (value: string) => { if (!pending.current) setDescriptionState(value); };
  const setCategory = (value: ReportCategory | '') => { if (!pending.current) setCategoryState(value); };

  async function submit() {
    if (pending.current) return;
    if (!point) { setError('Seleziona prima la posizione esatta sulla mappa.'); return; }
    if (description.trim().length < 10) { setError('Descrivi il problema con almeno 10 caratteri.'); return; }
    pending.current = true;
    setSubmitting(true); setError(null);
    try {
      const report = await api.createReport({ ...point, description, ...(category ? { category } : {}) });
      onCreated(report);
      setCreated(report);
      clearReportSignInDraft();
      setPointState(null); setDescriptionState(''); setCategoryState('');
    } catch (ex) {
      setError(ex instanceof Error ? ex.message : 'Invio non riuscito. Riprova.');
    } finally {
      pending.current = false;
      setSubmitting(false);
    }
  }

  return { point, setPoint, description, setDescription, category, setCategory,
    submitting, error, created, submit, startNew: () => setCreated(null) };
}

export type ReportDraft = ReturnType<typeof useReportDraft>;
