import { useState, type FormEvent } from 'react';
import type { GeocodeResult, LatLngTuple, OsmFeature, RouteResult } from '../../shared/types.ts';
import { api } from '../api.ts';
import { routeAlerts, type RouteAlert } from '../lib/alerts.ts';
import { formatDistance, formatDuration, type RouteAnalysis } from '../lib/analysis.ts';
import { compareRoutes } from '../lib/compare.ts';
import { verdictOf } from '../lib/verdict.ts';
import type { Recalc } from '../lib/reroute.ts';
import { spokenPlaceQuery } from '../lib/speech.ts';
import { DictationButton } from './DictationButton.tsx';
import { Icon } from './Icon.tsx';
import { NavigationPanel } from './NavigationPanel.tsx';
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
  footRoute: RouteResult | null;
  footAnalysis: RouteAnalysis | null;
  showFoot: boolean;
  setShowFoot: (v: boolean) => void;
  onSelect: (s: Selection) => void;
  onFocus: (coords: LatLngTuple[]) => void;
  recalc: Recalc | null;
  onDismissRecalc: () => void;
  /** Posizione GPS durante la guida vocale, mostrata sulla mappa */
  onPosition: (coordinate: LatLngTuple) => void;
}

/** Cosa è successo al percorso dopo l'ultima segnalazione. */
export const RECALC_TEXT: Record<Recalc['kind'], { tone: 'warn' | 'calm'; title: string; text: string }> = {
  running: { tone: 'calm', title: 'Ricalcolo in corso…', text: 'È stato segnalato un ostacolo sul tuo percorso: cerchiamo un\'alternativa.' },
  updated: { tone: 'calm', title: 'Ostacolo rilevato: percorso aggiornato', text: 'Il nuovo percorso non passa più dal punto segnalato.' },
  'no-alternative': { tone: 'warn', title: 'Nessun percorso alternativo', text: 'Non c\'è un percorso che eviti l\'ostacolo segnalato: quello mostrato ci passa ancora.' },
  error: { tone: 'warn', title: 'Ricalcolo non riuscito', text: 'Il percorso mostrato non tiene conto del nuovo ostacolo.' },
  'not-on-route': { tone: 'calm', title: 'Il percorso non cambia', text: 'L\'ostacolo segnalato non è sul tuo percorso. I prossimi percorsi lo eviteranno.' },
  unlocated: { tone: 'warn', title: 'Ostacolo non localizzato', text: 'Il punto è lontano da ogni via: non lo usiamo per il calcolo. Puoi spostarlo più vicino al marciapiede.' },
  caution: { tone: 'calm', title: 'Il percorso non cambia', text: 'La segnalazione è sulla mappa ma non blocca il passaggio.' },
};

function RecalcBanner({ recalc, onDismiss, onRetry }: { recalc: Recalc; onDismiss: () => void; onRetry: () => void }) {
  const t = RECALC_TEXT[recalc.kind];
  return (
    <div className={`banner banner--${t.tone}`} role="status" aria-live="polite" aria-busy={recalc.kind === 'running'}>
      <Icon name={recalc.kind === 'running' ? 'route' : t.tone === 'warn' ? 'warning' : 'check'} />
      <div className="banner__text">
        <strong>{t.title}</strong>
        <span>{recalc.kind === 'error' ? `${recalc.message} ${t.text}` : t.text}</span>
        {recalc.kind === 'error' && <button type="button" className="btn btn--sm btn--secondary" onClick={onRetry}>Riprova</button>}
      </div>
      {recalc.kind !== 'running' && (
        <button type="button" className="btn btn--icon banner__close" onClick={onDismiss} aria-label="Chiudi il messaggio"><Icon name="close" /></button>
      )}
    </div>
  );
}

type Compare = Pick<Props, 'footRoute' | 'footAnalysis' | 'showFoot' | 'setShowFoot'>;

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
    await runSearch(q);
  }

  async function runSearch(text: string) {
    setBusy(true); setErr(null); setResults(null);
    try {
      const r = await api.geocode(text);
      setResults(r);
      if (!r.length) setErr('Non abbiamo trovato questo indirizzo a Pisa. Prova a scriverlo in un altro modo o scegli il punto sulla mappa.');
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
            <button type="submit" className="btn btn--secondary btn--sm" disabled={busy || q.trim().length < 3}>
              <Icon name="search" /> {busy ? 'Cerco…' : 'Cerca'}
            </button>
          </form>
          {/* Dettatura: il testo riconosciuto viene cercato subito, ma il risultato va comunque scelto dall'elenco */}
          <DictationButton label={`Detta ${props.label.toLowerCase()}`} value={q} maxLength={200}
            onTranscript={(text) => { const query = spokenPlaceQuery(text); setQ(query); void runSearch(query); }} />
          <div className="row">
            <button type="button" className={`btn btn--ghost btn--sm${props.picking ? ' is-active' : ''}`} aria-pressed={props.picking} onClick={props.onPick}>
              <Icon name="pin" /> {props.picking ? 'Tocca la mappa…' : 'Scegli sulla mappa'}
            </button>
            {props.onLocate && (
              <button type="button" className="btn btn--ghost btn--sm" onClick={props.onLocate} disabled={props.locating}>
                <Icon name="locate" /> {props.locating ? 'Cerco dove sei…' : 'La mia posizione'}
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

function FeatureList({ title, items, onSelect }: { title: string; items: OsmFeature[]; onSelect: Props['onSelect'] }) {
  if (!items.length) return null;
  return (
    <div className="more__group">
      <h4 className="more__title">{title} <span className="count">{items.length}</span></h4>
      <ul className="plain-list">
        {items.map((f) => (
          <li key={f.id}><button type="button" onClick={() => onSelect({ type: 'feature', feature: f })}>{f.label}{f.name ? ` · ${f.name}` : ''}</button></li>
        ))}
      </ul>
    </div>
  );
}

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

function RouteSummary({ route, analysis, onSelect, onFocus, onPosition, compare }: {
  route: RouteResult; analysis: RouteAnalysis; onSelect: Props['onSelect']; onFocus: Props['onFocus']; onPosition: Props['onPosition']; compare: Compare;
}) {
  const alerts = routeAlerts(route, analysis);
  const v = verdictOf(route, alerts);
  const foot = route.mode === 'wheelchair' && compare.footRoute && compare.footAnalysis ? compare.footRoute : null;
  const c = foot ? compareRoutes({ distanceM: route.distanceM, analysis }, { distanceM: foot.distanceM, analysis: compare.footAnalysis! }) : null;
  const s = route.safety;
  const total = s ? s.pedestrianM + s.sidewalkM + s.carriagewayM || 1 : 1;
  const pct = (m: number) => `${(m / total) * 100}%`;

  return (
    <div className="summary" aria-live="polite">
      <div className={`verdict verdict--${v.tone}`}>
        <Icon name={v.tone === 'warn' ? 'warning' : 'info'} size={22} />
        <div>
          <h3 className="verdict__title">{v.title}</h3>
          <p className="verdict__text">{v.text}</p>
          <p className="verdict__meta">
            {formatDistance(route.distanceM)}
            {route.durationS !== null && <> · circa {formatDuration(route.durationS)}</>}
          </p>
        </div>
      </div>

      {(s?.choice || route.avoidedBlocking || route.avoidFailed || (c && c.avoidedKnown.length > 0)) && (
        <ul className="good-news">
          {route.avoidedBlocking ? (
            <li><Icon name="check" />Evita {plural(route.avoidedBlocking, 'ostacolo che gli utenti hanno segnalato come bloccante', 'ostacoli che gli utenti hanno segnalato come bloccanti')}.</li>
          ) : null}
          {route.avoidFailed && (
            <li className="is-warn"><Icon name="warning" />Non c'è un percorso che eviti un ostacolo segnalato come bloccante: lo trovi nell'elenco qui sotto.</li>
          )}
          {s?.choice && <li><Icon name="check" />{s.choice}</li>}
          {c && c.avoidedKnown.length > 0 && (
            <li><Icon name="check" />Evita {plural(c.avoidedKnown.length, 'ostacolo', 'ostacoli')} che il percorso a piedi incontrerebbe ({[...new Set(c.avoidedKnown.map((f) => f.label.split(' (')[0].toLowerCase()))].join(', ')}).</li>
          )}
        </ul>
      )}

      {alerts.length > 0 && (
        <section aria-labelledby="alerts-title">
          <h3 id="alerts-title" className="section-title">Lungo il percorso</h3>
          <ol className="alerts">
            {alerts.map((a, i) => (
              <li key={a.key}>
                <button type="button" onClick={() => (a.selection ? onSelect(a.selection) : onFocus(a.focus))}>
                  <span className="route-num" aria-hidden="true">{i + 1}</span>
                  <span className={`alert-icon alert-icon--${a.icon === 'block' ? 'blocking' : a.kind}`} aria-hidden="true"><Icon name={a.icon} /></span>
                  <span className="alerts__text">
                    <strong>{a.title}</strong>
                    {a.detail && <span>{a.detail}</span>}
                  </span>
                  <span className="alerts__where">a {formatDistance(a.alongM)}</span>
                </button>
              </li>
            ))}
          </ol>
        </section>
      )}

      {route.mode === 'wheelchair' && <NavigationPanel route={route} onPosition={onPosition} />}

      <p className="footnote">Basato sulla mappa libera OpenStreetMap: nessuno ha controllato questo percorso di persona.</p>

      <details className="more">
        <summary>Più dettagli</summary>
        {s?.checked && (
          <div className="more__group">
            <h4 className="more__title">Su che tipo di strada</h4>
            <div className="road-bar" aria-hidden="true">
              <span className="is-pedestrian" style={{ width: pct(s.pedestrianM) }} />
              <span className="is-sidewalk" style={{ width: pct(s.sidewalkM) }} />
              <span className="is-carriageway" style={{ width: pct(s.carriagewayM) }} />
            </div>
            <ul className="road-legend">
              <li><span className="key is-pedestrian" aria-hidden="true" />Marciapiedi, zone pedonali e attraversamenti<strong>{formatDistance(s.pedestrianM)}</strong></li>
              <li><span className="key is-sidewalk" aria-hidden="true" />Lungo strade con marciapiede<strong>{formatDistance(s.sidewalkM)}</strong></li>
              <li><span className="key is-carriageway" aria-hidden="true" />In strada, senza marciapiede<strong>{formatDistance(s.carriagewayM)}</strong></li>
            </ul>
          </div>
        )}
        {foot && c && (
          <div className="more__group">
            <h4 className="more__title">Confronto con il percorso a piedi</h4>
            <table className="compare__table">
              <thead><tr><th scope="col"><span className="sr-only">Percorso</span></th><th scope="col">Distanza</th><th scope="col">Ostacoli</th></tr></thead>
              <tbody>
                <tr><th scope="row"><span className="swatch swatch--wheel" aria-hidden="true" />Sedia a rotelle</th><td>{formatDistance(route.distanceM)}</td><td>{analysis.known.length}</td></tr>
                <tr><th scope="row"><span className="swatch swatch--foot" aria-hidden="true" />A piedi</th><td>{formatDistance(foot.distanceM)}</td><td>{compare.footAnalysis!.known.length}</td></tr>
              </tbody>
            </table>
            <label className="layer">
              <input type="checkbox" checked={compare.showFoot} onChange={(e) => compare.setShowFoot(e.target.checked)} />
              Mostra il percorso a piedi sulla mappa
            </label>
          </div>
        )}
        <FeatureList title="Possibili difficoltà minori" items={analysis.possible} onSelect={onSelect} />
        <FeatureList title="Attraversamenti senza informazioni sullo scivolo" items={analysis.unknown} onSelect={onSelect} />
        <FeatureList title="Elementi utili" items={analysis.positive} onSelect={onSelect} />
        <p className="field__help">
          Percorso calcolato da {route.provider === 'openrouteservice' ? 'OpenRouteService' : route.provider === 'valhalla' ? 'Valhalla (FOSSGIS)' : 'OSRM (FOSSGIS)'}
          {route.provider === 'valhalla' && ", che evita scale e sterrati ma non sa dove mancano gli scivoli dei marciapiedi"}.
          {' '}Sappiamo com'è il fondo per il {Math.round(analysis.coverage * 100)}% del percorso.
          {route.mode === 'wheelchair' && route.notice && ` ${route.notice}`}
        </p>
      </details>
    </div>
  );
}

export function RoutePanel(p: Props) {
  const [editing, setEditing] = useState(false);
  // Con un percorso calcolato partenza e arrivo si riducono a una riga: l'esito resta in vista anche su smartphone.
  if (p.route && p.analysis && p.from && p.to && !editing) {
    return (
      <section aria-labelledby="route-title" className="panel">
        <h2 id="route-title" className="sr-only">Il tuo percorso</h2>
        <div className="trip">
          <div className="trip__places">
            <span><span className="endpoint endpoint--A endpoint--sm" aria-hidden="true">A</span>{p.from.label}</span>
            <span><span className="endpoint endpoint--B endpoint--sm" aria-hidden="true">B</span>{p.to.label}</span>
          </div>
          <button type="button" className="btn btn--ghost btn--sm" onClick={() => setEditing(true)}>Modifica</button>
        </div>
        {p.recalc && <RecalcBanner recalc={p.recalc} onDismiss={p.onDismissRecalc} onRetry={p.onCalculate} />}
        <RouteSummary route={p.route} analysis={p.analysis} onSelect={p.onSelect} onFocus={p.onFocus} onPosition={p.onPosition} compare={p} />
      </section>
    );
  }
  return (
    <section aria-labelledby="route-title" className="panel">
      <h2 id="route-title" className="panel__title">Dove vuoi andare?</h2>
      <PlaceField letter="A" label="Partenza" value={p.from} picking={p.pickMode === 'from'}
        onPick={() => p.setPickMode(p.pickMode === 'from' ? null : 'from')} onSet={p.setFrom}
        onLocate={() => p.onLocate('from')} locating={p.locating} />
      <PlaceField letter="B" label="Arrivo" value={p.to} picking={p.pickMode === 'to'}
        onPick={() => p.setPickMode(p.pickMode === 'to' ? null : 'to')} onSet={p.setTo} />
      <div className="row">
        <button type="button" className="btn btn--primary btn--block" onClick={() => { setEditing(false); p.onCalculate(); }} disabled={!p.from || !p.to || p.loading}>
          {p.loading ? 'Cerco il percorso migliore…' : 'Calcola percorso'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => { p.setFrom(p.to); p.setTo(p.from); }}
          disabled={!p.from && !p.to} aria-label="Scambia partenza e arrivo" title="Scambia partenza e arrivo">
          <Icon name="swap" />
        </button>
      </div>
      {p.error && <p className="msg msg--error" role="alert">{p.error}</p>}
      {p.route && p.analysis && <RouteSummary route={p.route} analysis={p.analysis} onSelect={p.onSelect} onFocus={p.onFocus} onPosition={p.onPosition} compare={p} />}
      {!p.route && !p.error && !p.loading && (
        <p className="hint">Scegli partenza e arrivo: ti mostriamo un percorso per la sedia a rotelle e gli ostacoli da conoscere lungo la strada.</p>
      )}
    </section>
  );
}
