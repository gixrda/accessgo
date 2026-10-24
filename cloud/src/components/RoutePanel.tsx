import { useEffect, useState } from 'react';
import type { OsmFeature, Report, RouteResult } from '../../shared/types.ts';
import { formatDistance, formatDuration, type RouteAnalysis } from '../lib/analysis.ts';
import { compareRoutes, comparisonVerdict } from '../lib/compare.ts';
import { CATEGORY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import { Icon } from './Icon.tsx';
import { PanelActions } from './PanelActions.tsx';
import { NavigationPanel } from './NavigationPanel.tsx';
import { VoiceRoutePanel } from './VoiceRoutePanel.tsx';
import { MAX_VIA_STOPS, type Itinerary, type ViaStop } from '../hooks/useRoutePlanner.ts';
import { PlaceField } from './PlaceField.tsx';
import type { PickMode, Selection } from './MapView.tsx';

type Place = { lat: number; lng: number; label: string };

interface Props {
  voiceRequest?: { id: number; text: string };
  voiceResetKey?: number;
  onVoiceRequestConsumed?: () => void;
  actionsTarget?: HTMLElement | null;
  onNavigationPosition?: (coordinate: [number, number]) => void;
  onApplyItinerary?: (itinerary: Itinerary) => void;
  from: Place | null;
  to: Place | null;
  via?: ViaStop[];
  onAddVia?: () => void;
  onChangeVia?: (id: string, place: Place | null) => void;
  onRemoveVia?: (id: string) => void;
  onMoveVia?: (id: string, direction: -1 | 1) => void;
  onReverse?: () => void;
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
}

type Compare = Pick<Props, 'footRoute' | 'footAnalysis' | 'showFoot' | 'setShowFoot'>;

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

function CompareCard({ route, analysis, foot, footAnalysis, showFoot, setShowFoot, onSelect }: {
  route: RouteResult; analysis: RouteAnalysis; foot: RouteResult; footAnalysis: RouteAnalysis;
  showFoot: boolean; setShowFoot: (v: boolean) => void; onSelect: Props['onSelect'];
}) {
  const c = compareRoutes({ distanceM: route.distanceM, analysis }, { distanceM: foot.distanceM, analysis: footAnalysis });
  return (
    <section className="compare" aria-labelledby="compare-title">
      <h3 id="compare-title" className="compare__title">Confronto con il percorso a piedi</h3>
      <div className="compare__scroll" role="region" aria-label="Confronto dei percorsi" tabIndex={0}>
      <table className="compare__table">
        <thead>
          <tr><th scope="col"><span className="sr-only">Profilo</span></th><th scope="col">Distanza</th><th scope="col">Ostacoli noti</th><th scope="col">Possibili criticità</th></tr>
        </thead>
        <tbody>
          <tr>
            <th scope="row"><span className="swatch swatch--wheel" aria-hidden="true" />Sedia a rotelle</th>
            <td>{formatDistance(route.distanceM)}</td><td>{analysis.known.length}</td><td>{analysis.possible.length}</td>
          </tr>
          <tr>
            <th scope="row"><span className="swatch swatch--foot" aria-hidden="true" />A piedi</th>
            <td>{formatDistance(foot.distanceM)}</td><td>{footAnalysis.known.length}</td><td>{footAnalysis.possible.length}</td>
          </tr>
        </tbody>
      </table>
      </div>
      <p className={`compare__verdict${c.avoidedKnown.length ? ' is-strong' : ''}`}>{comparisonVerdict(c, formatDistance)}</p>
      <FeatureList title="Ostacoli noti evitati" items={c.avoidedKnown} tone="known" onSelect={onSelect} open />
      <FeatureList title="Ostacoli noti solo sul percorso per sedia a rotelle" items={c.addedKnown} tone="known" onSelect={onSelect} open />
      <label className="layer">
        <input type="checkbox" checked={showFoot} onChange={(e) => setShowFoot(e.target.checked)} />
        Mostra il percorso a piedi sulla mappa
      </label>
    </section>
  );
}

function RouteSummary({ route, analysis, onSelect, compare }: {
  route: RouteResult; analysis: RouteAnalysis; onSelect: Props['onSelect']; compare: Compare;
}) {
  const pct = Math.round(analysis.coverage * 100);
  const noKnown = !analysis.known.length && !analysis.reports.length;
  return (
    <div className="summary" aria-live="polite">
      {route.mode === 'wheelchair' ? (
        <div className="notice notice--info">
          <strong>Profilo sedia a rotelle</strong> — calcolato da {route.provider === 'openrouteservice' ? 'OpenRouteService' : 'Valhalla (FOSSGIS)'} sui dati OpenStreetMap.
          {route.provider === 'valhalla' && " Evita scale e fondi sterrati quando esiste un'alternativa, ma non conosce l'altezza dei cordoli: controlla gli attraversamenti qui sotto."}
          {route.notice && <> <br />{route.notice}</>}
        </div>
      ) : (
        <div className="notice notice--warn" role="note">
          <strong>Percorso pedonale standard, non calcolato per sedia a rotelle.</strong>{' '}
          {route.notice}{' '}
          Le criticità qui sotto sono comunque confrontate con i dati disponibili.
        </div>
      )}

      {route.mode === 'wheelchair' && compare.footRoute && compare.footAnalysis && (
        <CompareCard route={route} analysis={analysis} foot={compare.footRoute} footAnalysis={compare.footAnalysis}
          showFoot={compare.showFoot} setShowFoot={compare.setShowFoot} onSelect={onSelect} />
      )}

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
  const [manualOpen, setManualOpen] = useState(true);
  useEffect(() => { if (p.voiceRequest) setManualOpen(false); }, [p.voiceRequest?.id]);
  return (
    <section aria-labelledby="route-title" className="panel">
      <h2 id="route-title" className="panel__title">Trova un percorso</h2>
      {p.onApplyItinerary && <VoiceRoutePanel key={p.voiceResetKey} externalRequest={p.voiceRequest} onRequestConsumed={p.onVoiceRequestConsumed} compact onApply={p.onApplyItinerary} disabled={p.loading} />}
      {p.loading && <p className="msg" role="status">Calcolo il percorso…</p>}
      {p.error && <p className="msg msg--error" role="alert">{p.error}</p>}
      {p.route && <dl className="stats">
        <div><dt>Distanza</dt><dd>{formatDistance(p.route.distanceM)}</dd></div>
        <div><dt>Durata stimata</dt><dd>{p.route.durationS !== null ? formatDuration(p.route.durationS) : 'Non stimata'}</dd></div>
      </dl>}
      {p.route && <NavigationPanel route={p.route} onPosition={p.onNavigationPosition} />}
      <details className="manual-route" open={manualOpen} onToggle={(event) => setManualOpen(event.currentTarget.open)}>
      <summary>{p.route ? 'Modifica le tappe' : 'Scegli i punti manualmente'}</summary>
      <div className="manual-route__fields">
      <PlaceField letter="A" label="Partenza" value={p.from} picking={p.pickMode === 'from'}
        onPick={() => p.setPickMode(p.pickMode === 'from' ? null : 'from')} onSet={(place) => { p.setPickMode(null); p.setFrom(place); }}
        onLocate={() => { p.setPickMode(null); p.onLocate('from'); }} locating={p.locating} />
      {(p.via ?? []).map((stop, index) => <div key={stop.id} className="via-stop">
        <PlaceField letter={String.fromCharCode(66 + index)} label={`Tappa ${index + 1}`} value={stop.place}
          picking={p.pickMode === `via:${stop.id}`}
          onPick={() => p.setPickMode(p.pickMode === `via:${stop.id}` ? null : `via:${stop.id}`)}
          onSet={(place) => { p.setPickMode(null); p.onChangeVia?.(stop.id, place); }} />
        <div className="row via-stop__actions">
          <button type="button" className="btn btn--ghost btn--sm" disabled={index === 0}
            aria-label={`Sposta tappa ${index + 1} prima`} onClick={() => { p.setPickMode(null); p.onMoveVia?.(stop.id, -1); }}>↑ Prima</button>
          <button type="button" className="btn btn--ghost btn--sm" disabled={index === (p.via?.length ?? 0) - 1}
            aria-label={`Sposta tappa ${index + 1} dopo`} onClick={() => { p.setPickMode(null); p.onMoveVia?.(stop.id, 1); }}>↓ Dopo</button>
          <button type="button" className="btn btn--ghost btn--sm" aria-label={`Elimina tappa ${index + 1}`}
            onClick={() => { p.setPickMode(null); p.onRemoveVia?.(stop.id); }}>Elimina tappa</button>
        </div>
      </div>)}
      {p.onAddVia && <button type="button" className="btn btn--secondary btn--sm add-stop"
        disabled={(p.via?.length ?? 0) >= MAX_VIA_STOPS} onClick={() => { p.setPickMode(null); p.onAddVia?.(); }}>+ Aggiungi tappa</button>}
      <PlaceField letter={String.fromCharCode(66 + (p.via?.length ?? 0))} label="Destinazione" value={p.to} picking={p.pickMode === 'to'}
        onPick={() => p.setPickMode(p.pickMode === 'to' ? null : 'to')} onSet={(place) => { p.setPickMode(null); p.setTo(place); }} />
      {(p.via?.length ?? 0) > 0 && <p className="help">Visita le tappe nell’ordine indicato, fino a 5 punti. Completa tutte le tappe prima di calcolare.</p>}
      </div></details>
      {(manualOpen || p.route) && <PanelActions target={p.actionsTarget}>
      <div className="row">
        <button type="button" className="btn btn--primary btn--block" onClick={p.onCalculate} disabled={!p.from || !p.to || p.via?.some((stop) => !stop.place) || p.loading}>
          {p.loading ? 'Calcolo in corso…' : 'Calcola percorso'}
        </button>
        <button type="button" className="btn btn--ghost" onClick={() => { p.setPickMode(null); if (p.onReverse) p.onReverse(); else { p.setFrom(p.to); p.setTo(p.from); } }}
          disabled={!p.from && !p.to} aria-label="Inverti partenza e destinazione" title="Inverti">⇅</button>
      </div>
      </PanelActions>}
      {p.route && p.analysis && <RouteSummary route={p.route} analysis={p.analysis} onSelect={p.onSelect} compare={p} />}
      {!p.route && !p.error && !p.loading && (
        <p className="hint">Imposta partenza e destinazione cercando un indirizzo o toccando la mappa. AccessGo mostra le criticità note e quanto sono complete le informazioni lungo il tragitto.</p>
      )}
    </section>
  );
}
