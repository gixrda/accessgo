import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { inPisa, type GeocodeResult } from '../../shared/types.ts';
import type { RouteIntent } from '../../shared/routeIntent.ts';
import { api } from '../api.ts';
import type { Place } from '../hooks/useRoutePlanner.ts';
import { DictationButton } from './DictationButton.tsx';
import { locateForPlanning, type PlanningLocation } from '../lib/location.ts';

export interface VoiceItinerary { from: Place; to: Place; via: Place[] }
interface Field {
  id: string; label: string; query: string; candidates: GeocodeResult[];
  selected: Place | null; searching: boolean; error: string | null;
}
function pause(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) { reject(new DOMException('Aborted', 'AbortError')); return; }
    const abort = () => { clearTimeout(timer); reject(new DOMException('Aborted', 'AbortError')); };
    const timer = setTimeout(() => { signal.removeEventListener('abort', abort); resolve(); }, ms);
    signal.addEventListener('abort', abort, { once: true });
  });
}
function intentFields(intent: RouteIntent): Field[] {
  return [
    { id: 'origin', label: 'Partenza', query: intent.origin?.query ?? '' },
    ...intent.via.map((place, i) => ({ id: `via-${i}`, label: `Tappa ${i + 1}`, query: place.query })),
    { id: 'destination', label: 'Destinazione', query: intent.destination?.query ?? '' },
  ].map((field) => ({ ...field, candidates: [], selected: null, searching: false, error: null }));
}

/** Speech prepares an editable plan; only explicit candidate selection and confirmation produce a route. */
export function VoiceRoutePanel({ onApply, disabled = false, externalRequest, compact = false, onRequestConsumed }: {
  onApply: (itinerary: VoiceItinerary) => void; disabled?: boolean;
  externalRequest?: { id: number; text: string }; compact?: boolean; onRequestConsumed?: () => void;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [intent, setIntent] = useState<RouteIntent | null>(null);
  const [fields, setFields] = useState<Field[]>([]);
  const [busy, setBusy] = useState<'interpreting' | 'resolving' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  const [approximateOrigin, setApproximateOrigin] = useState<PlanningLocation | null>(null);
  const [applied, setApplied] = useState(false);
  const revision = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const gpsRevision = useRef(0);
  const lastSearchAt = useRef(0);
  const handledRequest = useRef<number | null>(null);
  const latest = useRef({ disabled, fields, onApply });
  latest.current = { disabled, fields, onApply };

  const abortPending = useCallback(() => {
    revision.current += 1; gpsRevision.current += 1;
    controller.current?.abort(); controller.current = null;
  }, []);
  const cancelRequests = useCallback(() => {
    abortPending(); setBusy(null); setLocating(false); setApproximateOrigin(null);
    setFields((current) => current.map((field) => ({ ...field, searching: false })));
  }, [abortPending]);
  const resetPlan = useCallback(() => {
    cancelRequests(); setIntent(null); setFields([]); setError(null); setApplied(false);
  }, [cancelRequests]);
  useEffect(() => () => abortPending(), [abortPending]);
  useEffect(() => { if (disabled) cancelRequests(); }, [disabled, cancelRequests]);

  const current = (sequence: number, signal: AbortSignal) => sequence === revision.current
    && !signal.aborted && !latest.current.disabled;
  const updateField = (fieldId: string, patch: Partial<Field>) => {
    setFields((items) => items.map((item) => item.id === fieldId ? { ...item, ...patch } : item));
  };

  async function resolveFields(items: Field[], sequence: number, signal: AbortSignal) {
    setBusy('resolving');
    for (const field of items) {
      if (field.query.trim().length < 3) continue;
      try {
        // The existing geocoder is shared with manual fields: never fan out provider requests.
        await pause(Math.max(0, 2300 - (Date.now() - lastSearchAt.current)), signal);
        if (!current(sequence, signal)) return;
        updateField(field.id, { searching: true, error: null });
        lastSearchAt.current = Date.now();
        const results = await api.geocode(field.query.trim(), signal);
        if (!current(sequence, signal)) return;
        const candidates = results.filter((place) => inPisa(place.lat, place.lng));
        updateField(field.id, { searching: false, candidates, selected: null,
          error: candidates.length ? null : 'Nessun risultato a Pisa. Specifica il nome completo o un indirizzo diverso.' });
      } catch (reason) {
        if (!current(sequence, signal)) return;
        updateField(field.id, { searching: false, error: reason instanceof Error ? reason.message : 'Ricerca non disponibile. Riprova.' });
      }
    }
    if (current(sequence, signal)) { setBusy(null); controller.current = null; }
  }

  async function prepare(source = text) {
    const query = source.trim();
    if (disabled || query.length < 3 || query.length > 500) return;
    resetPlan(); setText(source); setBusy('interpreting');
    const sequence = revision.current;
    const abort = new AbortController(); controller.current = abort;
    try {
      const result = await api.interpretRoute(query, abort.signal);
      if (!current(sequence, abort.signal)) return;
      setIntent(result);
      if (result.intent === 'unclear') { setBusy(null); controller.current = null; return; }
      const items = intentFields(result);
      setFields(items);
      await resolveFields(items, sequence, abort.signal);
    } catch (reason) {
      if (!current(sequence, abort.signal)) return;
      setBusy(null); controller.current = null;
      setError(reason instanceof Error ? reason.message : 'Non riesco a preparare il percorso. Puoi usare i campi manuali qui sotto.');
    }
  }

  const prepareLatest = useRef(prepare);
  prepareLatest.current = prepare;
  useEffect(() => {
    if (disabled || !externalRequest || handledRequest.current === externalRequest.id) return;
    handledRequest.current = externalRequest.id;
    void prepareLatest.current(externalRequest.text);
    onRequestConsumed?.();
  }, [externalRequest?.id, disabled]);

  function changeQuery(fieldId: string, query: string) {
    cancelRequests(); setApplied(false);
    updateField(fieldId, { query, candidates: [], selected: null, error: null });
  }
  function search(field: Field) {
    if (disabled || field.query.trim().length < 3) return;
    cancelRequests(); setApplied(false);
    const abort = new AbortController(); controller.current = abort;
    void resolveFields([field], revision.current, abort.signal);
  }
  async function locateOrigin() {
    if (disabled || locating || busy !== null) return;
    cancelRequests(); setApplied(false);
    const sequence = revision.current;
    const gpsId = ++gpsRevision.current;
    const stillCurrent = () => sequence === revision.current && gpsId === gpsRevision.current && !latest.current.disabled;
    setLocating(true); updateField('origin', { error: null, selected: null });
    try {
      const location = await locateForPlanning();
      if (!stillCurrent()) return;
      setLocating(false);
      if (location.approximate) { setApproximateOrigin(location); return; }
      updateField('origin', { selected: { lat: location.lat, lng: location.lng, label: 'La mia posizione' }, query: '', candidates: [], error: null });
    } catch (reason) {
      if (!stillCurrent()) return;
      setLocating(false);
      updateField('origin', { error: reason instanceof Error ? reason.message : 'Posizione non disponibile. Scrivi un indirizzo di partenza.' });
    }
  }
  function confirmApproximateOrigin() {
    if (disabled || !approximateOrigin) return;
    const { lat, lng, accuracy } = approximateOrigin;
    updateField('origin', { selected: { lat, lng, label: `La mia posizione (circa ${Math.round(accuracy)} m)` }, query: '', candidates: [], error: null });
    setApproximateOrigin(null); setApplied(false);
  }

  const canApply = fields.length >= 2 && fields.every((field) => field.selected) && !busy && !locating && !disabled && !applied;
  function apply() {
    const values = latest.current.fields;
    if (!canApply || values.some((field) => !field.selected)) return;
    setApplied(true);
    latest.current.onApply({ from: values[0].selected!, to: values[values.length - 1].selected!, via: values.slice(1, -1).map((field) => field.selected!) });
  }

  if (compact && !busy && !intent && !error && !applied) return null;

  if (applied) return <section className="voice-route voice-route--applied" aria-labelledby={`${id}-title`}>
    <h3 id={`${id}-title`}>Percorso impostato</h3>
    <p className="hint">La richiesta è confermata. Consulta il risultato del percorso e la mappa.</p>
    <button type="button" className="btn btn--secondary" disabled={disabled}
      onClick={() => { resetPlan(); setText(''); }}>Nuova richiesta vocale</button>
  </section>;

  return <section className="voice-route" aria-labelledby={`${id}-title`}>
    {compact ? <div className="voice-route__heading voice-route__heading--compact">
      <h3 id={`${id}-title`}>{busy === 'interpreting' ? 'Preparo la richiesta…' : intent ? 'Controlla i luoghi' : 'Pianifica un percorso'}</h3>
      <p className="hint">{text || 'Pianifica con la voce o la ricerca in alto.'}</p>
    </div> : <>
    <div className="voice-route__heading">
      <span className="voice-route__eyebrow">Assistente vocale</span>
      <h3 id={`${id}-title`}>Dove vuoi andare?</h3>
      <p>Parla o scrivi. ElevenLabs trascrive, Gemma prepara i luoghi da confermare.</p>
    </div>
    <DictationButton label="Parla per pianificare" value={text} maxLength={500} language="auto" autoPrepare
      disabled={disabled} onRecordingStart={resetPlan}
      onTranscript={(transcript) => { setText(transcript); void prepare(transcript); }} />
    <label className="field__label" htmlFor={`${id}-request`}>La tua richiesta</label>
    <textarea id={`${id}-request`} className="voice-route__request" rows={3} maxLength={500} value={text} disabled={disabled}
      placeholder="Vorrei andare alla Torre di Pisa dalla mia posizione."
      onChange={(event) => { resetPlan(); setText(event.target.value); }} />
    </>}
    <div className="voice-route__actions">
      {!compact && <button type="button" className="btn btn--primary" disabled={disabled || busy !== null || text.trim().length < 3}
        onClick={() => void prepare()}>{busy === 'interpreting' ? 'Interpreto la richiesta…' : 'Prepara percorso'}</button>}
      {(busy || intent || error) && <button type="button" className="btn btn--ghost" onClick={resetPlan}>Annulla preparazione</button>}
    </div>
    {error && <p className="msg msg--error" role="alert">{error}</p>}
    {intent && <div className="voice-route__review">
      <p className="voice-route__engine">{intent.engine === 'gemma' ? `Interpretata da Gemma${intent.model ? ` · ${intent.model}` : ''}` : intent.engine === 'search' ? 'Ricerca diretta del luogo · senza AI' : 'Interpretazione a regole · Gemma non utilizzato'}</p>
      {intent.note && <p className="hint">{intent.note}</p>}
      {intent.clarification && <p className="msg">{intent.clarification}</p>}
      {intent.intent === 'unclear' && <p className="hint">Completa la richiesta nella ricerca, per esempio: “Da Piazza dei Cavalieri alla Torre di Pisa”.</p>}
      {intent.intent === 'route' && <>
        <h4>Conferma i luoghi</h4>
        <p className="hint">Un nome non identifica un ingresso accessibile. Scegli il risultato corretto per ogni punto, nell’ordine indicato.</p>
        {fields.map((field, index) => <div key={field.id} className="voice-route__place">
          <label className="field__label" htmlFor={`${id}-${field.id}`}>{String.fromCharCode(65 + index)} · {field.label}</label>
          {field.id === 'origin' && <button type="button" className="btn btn--secondary" disabled={disabled || locating || busy !== null}
            onClick={() => void locateOrigin()}>{locating ? 'Cerco la tua posizione…' : 'Usa la mia posizione'}</button>}
          {field.id === 'origin' && approximateOrigin && <div className="voice-route__location-confirm">
            <p className="msg msg--warn">Posizione approssimativa (~{Math.round(approximateOrigin.accuracy)} m). Confermi questo punto per pianificare il percorso?</p>
            <button type="button" className="btn btn--secondary" disabled={disabled} onClick={confirmApproximateOrigin}>Conferma posizione approssimativa</button>
            <button type="button" className="btn btn--ghost" onClick={() => setApproximateOrigin(null)}>Scarta posizione</button>
          </div>}
          <div className="voice-route__search">
            <input id={`${id}-${field.id}`} type="search" value={field.query} maxLength={200} disabled={disabled}
              placeholder={field.id === 'origin' ? 'Oppure scrivi la partenza a Pisa' : 'Nome o indirizzo a Pisa'}
              onChange={(event) => changeQuery(field.id, event.target.value)} />
            <button type="button" className="btn btn--secondary" disabled={disabled || busy !== null || field.query.trim().length < 3}
              onClick={() => search(field)} aria-label={`Cerca ${field.label.toLowerCase()}`}>{field.searching ? 'Cerco…' : 'Cerca'}</button>
          </div>
          {field.candidates.length > 0 && <>
            <label className="hint" htmlFor={`${id}-${field.id}-candidate`}>Scegli {field.label.toLowerCase()}</label>
            <select id={`${id}-${field.id}-candidate`} value={field.selected ? field.candidates.findIndex((candidate) => candidate === field.selected).toString() : ''}
              disabled={disabled} onChange={(event) => {
                const selected = event.target.value === '' ? null : field.candidates[Number(event.target.value)];
                // An explicit origin choice also invalidates a pending GPS callback.
                if (field.id === 'origin') { gpsRevision.current += 1; setLocating(false); setApproximateOrigin(null); }
                setApplied(false);
                updateField(field.id, { selected: selected ?? null, error: null });
              }}>
              <option value="">Seleziona un risultato</option>
              {field.candidates.map((candidate, candidateIndex) => <option key={`${candidate.lat}-${candidate.lng}-${candidateIndex}`} value={candidateIndex}>{candidate.label}</option>)}
            </select>
          </>}
          {field.selected && <p className="voice-route__chosen">✓ {field.selected.label}</p>}
          {field.error && <p className="msg msg--error" role="alert">{field.error}</p>}
        </div>)}
        {busy === 'resolving' && <p className="hint">Cerco i luoghi uno alla volta…</p>}
        <button type="button" className="btn btn--primary btn--block" disabled={!canApply} onClick={apply}>
          {applied ? 'Percorso confermato' : 'Conferma e calcola percorso'}
        </button>
      </>}
    </div>}
  </section>;
}
