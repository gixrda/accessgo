import { useCallback, useEffect, useRef, useState } from 'react';
import type { Interpretation } from '../../shared/types.ts';
import { api } from '../api.ts';

/** An analysis is ephemeral: it never creates a report or writes browser storage. */
export function useReportAnalysis(description: string) {
  const [interpretation, setInterpretation] = useState<Interpretation | null>(null);
  const [analysing, setAnalysing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const currentDescription = useRef(description);
  currentDescription.current = description;

  const cancel = useCallback(() => {
    revision.current += 1;
    request.current?.abort();
    request.current = null;
  }, []);

  const reset = useCallback(() => {
    cancel();
    setAnalysing(false);
    setInterpretation(null);
    setError(null);
  }, [cancel]);

  useEffect(() => { reset(); }, [description, reset]);
  useEffect(() => cancel, [cancel]);

  async function analyze() {
    if (request.current || description.trim().length < 10 || description.length > 1000) return;
    const controller = new AbortController();
    const startedRevision = ++revision.current;
    const source = description;
    request.current = controller;
    setAnalysing(true);
    setInterpretation(null);
    setError(null);

    const isCurrent = () => !controller.signal.aborted
      && startedRevision === revision.current && currentDescription.current === source;
    try {
      const result = await api.analyzeReport(source, controller.signal);
      if (isCurrent()) setInterpretation(result.interpretation);
    } catch (cause) {
      if (isCurrent()) setError(cause instanceof Error ? cause.message : 'Analisi non riuscita. Riprova.');
    } finally {
      if (isCurrent()) {
        request.current = null;
        setAnalysing(false);
      }
    }
  }

  return { interpretation, analysing, error, analyze, reset, isPending: () => request.current !== null };
}
