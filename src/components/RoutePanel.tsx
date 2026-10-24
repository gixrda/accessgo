import { useState, type FormEvent } from 'react';
import type { GeocodeResult, OsmFeature, Report, RouteResult } from '../../shared/types.ts';
import { api } from '../api.ts';
import { formatDistance, formatDuration, type RouteAnalysis } from '../lib/analysis.ts';
import { CATEGORY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import { Icon } from './Icon.tsx';
import type { PickMode, Selection } from './MapView.tsx';

type Place = { lat: number; lng: number; label: string };

interface Props {
  from: Place | null;
  to: Place | null;
  setFrom: (p: Place | null) => void;
  setTo: (p: Place | null) => void;
  pickMode: PickMode;
  setPickMode: (m: PickMode) => void;
  onLocate: (target: 'from') => void;
  locating: boolean;
  onCalculate: () => void;
  loading: boolean;
  error: string | null;
  route: RouteResult | null;
  analysis: RouteAnalysis | null;
  onSelect: (s: Selection) => void;
}

function PlaceField(props: {
  letter: 'A' | 'B'; label: string; value: Place | null; picking: boolean;
  onPick: () => void; onSet: (p: Place | null) => void; onLocate?: () => void; locating?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<GeocodeResult[] | null>(null);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const id = `place-${props.letter}`;

  async function search(e: FormEvent) {
    e.preventDefault();
    setBusy(true); setErr(null); setResults(null);
    try {
      const r = await api.geocode(q);
      setResults(r);
      if (!r.length) setErr('Nessun risultato a Pisa. Prova con un altro indirizzo o seleziona il punto sulla mappa.');
    } catch (ex) {
      setErr((ex as Error).message);
    } finally { setBusy(false); }
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
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => props.onSet(null)} aria-label={`Rimuovi ${props.label.toLowerCase()}`}>Cambia</button>
        </div>
      ) : (
        <>
          <form className="search" onSubmit={search} role="search">
            <input id={id} type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Via, piazza o luogo a Pisa" autoComplete="off" />
            <button type="submit" className="btn btn--secondary btn--sm" disabled={busy || q.trim().length < 3}>{busy ? 'Cerco…' : 'Cerca'}</button>
          </form>
          <div className="row">
            <button type="button" className={`btn btn--ghost btn--sm${props.picking ? ' is-active' : ''}`} aria-pressed={props.picking} onClick={props.onPick}>
              <Icon name="locate" /> {props.picking ? 'Tocca la mappa…' : 'Scegli sulla mappa'}
            </button>
            {props.onLocate && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={props.onLocate} disabled={props.locating}>
                {props.locating ? 'Localizzo…' : 'La mia posizione'}
              </button>
            )}
          </div>
          {err && <p className="msg msg--error" role="alert">{err}</p>}
          {results && results.length > 0 && (
            <ul className="results" aria-label="Risultati della ricerca">
              {results.map((r) => (
                <li key={`${r.lat},${r.lng}`}>
                  <button type="button" onClick={() => { props.onSet({ lat: r.lat, lng: r.lng, label: r.label.split(',').slice(0, 2).join(',') }); setResults(null); setQ(''); }}>
                    {r.label}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}

function FeatureList({ title, items, tone, onSelect, open }: {
  title: string; items: OsmFeature[]; tone: string; onSelect: Props['onSelect']; open?: boolean;
}) {
  if (!items.length) return null;
  return (
    <details className={`group group--${tone}`} open={open}>
      <summary><span className={`mk mk--${tone} mk--inline`} aria-hidden="true" /> {title} <span className="count">{items.length}</span></summary>
      <ul>
        {items.map((f) => (
          <li key={f.id}><button type="button" onClick={() => onSelect({ type: 'feature', feature: f })}>{f.label}{f.name ? ` · ${f.name}` : ''}</button></li>
        ))}
      </ul>
    </details>
  );
}

function ReportList({ items, onSelect }: { items: Report[]; onSelect: Props['onSelect'] }) {
  if (!items.length) return null;
  return (
    <details className="group group--report" open>
      <summary><span className="mk mk--report mk--inline" aria-hidden="true" /> Segnalazioni degli utenti <span className="count">{items.length}</span></summary>
      <ul>
        {items.map((r) => (
          <li key={r.id}>
            <button type="button" onClick={() => onSelect({ type: 'report', report: r })}>
              {CATEGORY_LABEL[r.category]} <span className={`status status--${r.status}`}>{STATUS_LABEL[r.status]}</span>
            </button>
          </li>
        ))}
      </ul>
    </details>
  );
}

function RouteSummary({ route, analysis, onSelect }: { route: RouteResult; analysis: RouteAnalysis; onSelect: Props['onSelect'] }) {
  const pct = Math.round(analysis.coverage * 100);
  const noKnown = !analysis.known.length && !analysis.reports.length;
  return (
    <div className="summary" aria-live="polite">
      {route.mode === 'wheelchair' ? (
        <div className="notice notice--info">
          <strong>Profilo sedia a rotelle</strong> — calcolato da OpenRouteService sui dati OpenStreetMap.
        </div>
      ) : (
        <div className="notice notice--warn" role="note">
          <strong>Percorso pedonale standard, non calcolato per sedia a rotelle.</strong>{' '}
          {route.notice ?? 'Il routing per sedia a rotelle richiede una chiave OpenRouteService non configurata.'}{' '}
          Le criticità qui sotto sono comunque confrontate con i dati disponibili.
        </div>
      )}

      <dl className="stats">
        <div><dt>Distanza</dt><dd>{formatDistance(route.distanceM)}</dd></div>
        <div>
          <dt>Durata stimata</dt>
          <dd>{route.durationS !== null ? formatDuration(route.durationS) : <span className="muted" title="La durata disponibile è calcolata a passo pedonale">Non stimata</span>}</dd>
        </div>
      </dl>

      <ol className="ladder" aria-label="Affidabilità delle informazioni">
        <li className="ladder__step is-done"><span aria-hidden="true">✓</span> Percorso calcolato</li>
        <li className="ladder__step is-done"><span aria-hidden="true">✓</span> Confrontato con OpenStreetMap e segnalazioni</li>
        <li className="ladder__step is-missing"><span aria-hidden="true">✕</span> Non verificato sul posto</li>
      </ol>

      <div className="coverage">
        <div className="coverage__head">
          <span>Dati su superficie, pendenza o larghezza</span>
          <strong>{pct}% del percorso</strong>
        </div>
        <div className="meter" role="meter" aria-valuemin={0} aria-valuemax={100} aria-valuenow={pct} aria-label="Copertura dei dati di accessibilità">
          <span style={{ width: `${pct}%` }} />
        </div>
        {pct < 50 && (
          <p className="msg msg--warn">Informazioni insufficienti per gran parte del tragitto: l'assenza di ostacoli noti non significa che il percorso sia accessibile.</p>
        )}
      </div>

      {noKnown && (
        <p className="msg">Nessun ostacolo noto lungo il percorso <strong>nei dati disponibili</strong>. Questo non garantisce che il percorso sia accessibile.</p>
      )}
      <FeatureList title="Ostacoli noti" items={analysis.known} tone="known" onSelect={onSelect} open />
      <ReportList items={analysis.reports} onSelect={onSelect} />
      <FeatureList title="Possibili criticità" items={analysis.possible} tone="possible" onSelect={onSelect} open={analysis.possible.length <= 6} />
      <FeatureList title="Attraversamenti senza dati sul cordolo" items={analysis.unknown} tone="info" onSelect={onSelect} open={analysis.unknown.length <= 4} />
      <FeatureList title="Elementi favorevoli" items={analysis.positive} tone="positive" onSelect={onSelect} />
    </div>
  );
}

export function RoutePanel(p: Props) {
  return (
    <section aria-labelledby="route-title" className="panel">
      <h2 id="route-title" className="panel__title">Trova un percorso</h2>
      <PlaceField letter="A" label="Partenza" value={p.from} picking={p.pickMode === 'from'}
        onPick={() => p.setPickMode(p.pickMode === 'from' ? null : 'from')} onSet={p.setFrom}
        onLocate={() => p.onLocate('from')} locating={p.locating} />
      <PlaceField letter="B" label="Destinazione" value={p.to} picking={p.pickMode === 'to'}
        onPick={() => p.setPickMode(p.pickMode === 'to' ? null : 'to')} onSet={p.setTo} />
      <div className="row">
        <button type="button" className="btn btn--primary btn--block" onClick={p.onCalculate} disabled={!p.from || !p.to || p.loading}>
          {p.loading ? 'Calcolo in corso…' : 'Calcola percorso'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => { p.setFrom(p.to); p.setTo(p.from); }}
          disabled={!p.from && !p.to} aria-label="Inverti partenza e destinazione" title="Inverti">⇅</button>
      </div>
      {p.error && <p className="msg msg--error" role="alert">{p.error}</p>}
      {p.route && p.analysis && <RouteSummary route={p.route} analysis={p.analysis} onSelect={p.onSelect} />}
      {!p.route && !p.error && !p.loading && (
        <p className="hint">Imposta partenza e destinazione cercando un indirizzo o toccando la mappa. AccessGo mostra le criticità note e quanto sono complete le informazioni lungo il tragitto.</p>
      )}
    </section>
  );
}
