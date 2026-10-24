import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { GeocodeResult } from '../../shared/types.ts';
import { api } from '../api.ts';
import { DictationButton } from './DictationButton.tsx';
import { Icon } from './Icon.tsx';
import { dismissKeyboard } from '../lib/formViewport.ts';

type Place = { lat: number; lng: number; label: string };
interface Props {
  letter: string; label: string; value: Place | null; picking: boolean;
  onPick: () => void; onSet: (p: Place | null) => void; onLocate?: () => void; locating?: boolean;
}

const GENERIC_QUERY = /^(via|viale|vicolo|piazza|piazzale|largo|lungarno|strada|corso|pisa)$/i;

/** Searches are explicit submissions; typing never sends autocomplete requests. */
export function PlaceField(props: Props) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [searched, setSearched] = useState('');
  const requestId = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const id = `place-${props.letter}`;

  function invalidate() {
    requestId.current += 1;
    controller.current?.abort();
    controller.current = null;
  }
  useEffect(() => () => invalidate(), []);
  useEffect(() => {
    if (props.value) { invalidate(); setBusy(false); setResults(null); setErr(null); }
  }, [props.value]);

  function clearSearch() {
    invalidate(); setBusy(false); setResults(null); setErr(null); setSearched('');
  }

  async function search(e: FormEvent) {
    e.preventDefault();
    const query = q.trim().replace(/\s+/g, ' ');
    if (query.length < 3 || busy || controller.current) return;
    invalidate();
    const current = requestId.current;
    const abort = new AbortController();
    controller.current = abort;
    setBusy(true); setErr(null); setResults(null); setSearched(query);
    try {
      const r = await api.geocode(query, abort.signal);
      if (requestId.current === current) setResults(r);
    } catch (ex) {
      if (requestId.current === current && !abort.signal.aborted) {
        setErr(ex instanceof Error ? ex.message : 'Ricerca non disponibile. Riprova.');
      }
    } finally {
      if (requestId.current === current) { controller.current = null; setBusy(false); }
    }
  }

  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        <span className={`endpoint endpoint--${props.letter} endpoint--sm`} aria-hidden="true">{props.letter}</span>
        {props.label}
      </label>
      {props.value ? (
        <div className="place">
          <span className="place__text" id={id}>{props.value.label}</span>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => { clearSearch(); setQ(''); props.onSet(null); }} aria-label={`Rimuovi ${props.label.toLowerCase()}`}>Cambia</button>
        </div>
      ) : (
        <>
          <form className="search" onSubmit={search} role="search" aria-label={`Cerca ${props.label.toLowerCase()}`} aria-busy={busy}>
            <input id={id} type="search" value={q} onChange={(e) => { clearSearch(); setQ(e.target.value); }}
              placeholder="Es. Piazza dei Cavalieri" autoComplete="off" enterKeyHint="search" maxLength={200} aria-describedby={`${id}-help`} />
            <button type="submit" className="btn btn--secondary btn--sm" disabled={busy || q.trim().length < 3}>{busy ? 'Cerco…' : 'Cerca'}</button>
          </form>
          <p className="help" id={`${id}-help`}>Nome del luogo o via e numero civico, a Pisa. Premi Cerca.</p>
          <DictationButton value={q} disabled={busy} maxLength={200} label={`Detta ${props.label.toLowerCase()}`}
            onTranscript={(text) => { clearSearch(); setQ(text.slice(0, 200)); }} />
          <div className="row">
            <button type="button" className={`btn btn--ghost btn--sm${props.picking ? ' is-active' : ''}`} aria-pressed={props.picking}
              onClick={() => { clearSearch(); props.onPick(); }}>
              <Icon name="locate" /> {props.picking ? 'Tocca la mappa…' : 'Scegli sulla mappa'}
            </button>
            {props.onLocate && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { clearSearch(); props.onLocate?.(); }} disabled={props.locating}>
                {props.locating ? 'Localizzo…' : 'La mia posizione'}
              </button>
            )}
          </div>
          {err && <p className="msg msg--error" role="alert">{err}</p>}
          {results && (
            <div className="search-feedback">
              <p className="help" role="status">
                {results.length
                  ? `${results.length} ${results.length === 1 ? 'risultato' : 'risultati'} per “${searched}”. Scegli il punto corretto.`
                  : GENERIC_QUERY.test(searched)
                    ? `“${searched}” è troppo generico. Scrivi il nome completo, per esempio Piazza dei Cavalieri o Via Roma.`
                    : `Nessun risultato nell’area di Pisa per “${searched}”. Controlla nome e numero civico oppure scegli il punto sulla mappa.`}
              </p>
              {results.length > 0 && <>
                <ul className="results" aria-label={`Risultati ${props.label.toLowerCase()}`}>
                  {results.map((r) => (
                    <li key={`${r.label}-${r.lat}-${r.lng}`}>
                      <button type="button" onClick={() => { dismissKeyboard(); clearSearch(); setQ(''); props.onSet({ ...r }); }}>{r.label}</button>
                    </li>
                  ))}
                </ul>
                <p className="help">© OpenStreetMap contributors. I punti indicativi non identificano un ingresso accessibile.</p>
              </>}
            </div>
          )}
        </>
      )}
    </div>
  );
}
