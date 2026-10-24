import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inPisa, type OsmDataset, type Report, type RouteResult, type ServerStatus } from '../shared/types.ts';
import { api } from './api.ts';
import { DetailPanel } from './components/DetailPanel.tsx';
import { MapControls } from './components/MapControls.tsx';
import { MapView, type Focus, type Layers, type PickMode, type Selection } from './components/MapView.tsx';
import { ReportPanel } from './components/ReportPanel.tsx';
import { RoutePanel } from './components/RoutePanel.tsx';
import { routeAlerts } from './lib/alerts.ts';
import { analyzeRoute } from './lib/analysis.ts';
import { avoids, rerouteDecision, type Recalc } from './lib/reroute.ts';

type Place = { lat: number; lng: number; label: string };
type Tab = 'route' | 'report';

const PICK_PROMPT: Record<Exclude<PickMode, null>, string> = {
  from: 'Tocca la mappa per scegliere la partenza',
  to: "Tocca la mappa per scegliere l'arrivo",
  report: "Tocca il punto esatto dell'ostacolo",
};

function placeFromUrl(key: string): Place | null {
  const [lat, lng] = (new URLSearchParams(window.location.search).get(key) ?? '').split(',').map(Number);
  return inPisa(lat, lng) ? { lat, lng, label: 'Punto indicato nel link' } : null;
}

export default function App() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [osm, setOsm] = useState<OsmDataset | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>('route');
  const [sheetOpen, setSheetOpen] = useState(true);
  const [layers, setLayers] = useState<Layers>({ known: true, possible: true, positive: true, info: false, places: false, reports: true });
  const [pickMode, setPickModeRaw] = useState<PickMode>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<Focus>(null);

  // ?from=lat,lng&to=lat,lng precompila partenza e arrivo (link ripetibili per la demo).
  const [from, setFrom] = useState<Place | null>(() => placeFromUrl('from'));
  const [to, setTo] = useState<Place | null>(() => placeFromUrl('to'));
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [footRoute, setFootRoute] = useState<RouteResult | null>(null);
  const [showFoot, setShowFoot] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [reportPoint, setReportPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);
  const sheetRef = useRef<HTMLElement>(null);
  const requestId = useRef(0);
  const [recalc, setRecalc] = useState<Recalc | null>(null);

  // Su smartphone il pannello copre la parte bassa della mappa: la sua altezza sposta l'attribuzione e i controlli in basso.
  useEffect(() => {
    const el = sheetRef.current;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const ro = new ResizeObserver(() => document.documentElement.style.setProperty('--sheet-h', `${el.offsetHeight}px`));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    // Ogni sorgente fallisce in modo indipendente: la mappa resta utilizzabile anche senza dati OSM o segnalazioni.
    api.status().then(setStatus).catch(() => setStatus(null));
    api.osm().then(setOsm).catch(() => setLoadError('Non riusciamo a caricare gli ostacoli conosciuti: la mappa funziona, ma non li vedrai. Ricarica la pagina tra poco.'));
    api.reports().then(setReports).catch(() => setLoadError('Non riusciamo a caricare le segnalazioni degli utenti. Ricarica la pagina tra poco.'));
  }, []);

  const features = useMemo(() => osm?.features ?? [], [osm]);
  const analysis = useMemo(() => route ? analyzeRoute(route.coords, features, reports) : null, [route, features, reports]);
  const footAnalysis = useMemo(() => footRoute ? analyzeRoute(footRoute.coords, features, reports) : null, [footRoute, features, reports]);

  const setPickMode = useCallback((m: PickMode) => {
    setPickModeRaw(m);
    if (m && window.matchMedia('(max-width: 759px)').matches) setSheetOpen(false); // libera la mappa su smartphone
  }, []);

  // Un nuovo punto invalida il percorso precedente.
  const changeFrom = (p: Place | null) => { setFrom(p); setRoute(null); setFootRoute(null); setRouteError(null); setRecalc(null); };
  const changeTo = (p: Place | null) => { setTo(p); setRoute(null); setFootRoute(null); setRouteError(null); setRecalc(null); };

  function onPick(p: { lat: number; lng: number }) {
    const label = 'Punto scelto sulla mappa';
    if (pickMode === 'from') changeFrom({ ...p, label });
    if (pickMode === 'to') changeTo({ ...p, label });
    if (pickMode === 'report') setReportPoint(p);
    setPickModeRaw(null);
    setGeoError(null);
    setSheetOpen(true);
  }

  function locate(target: 'from' | 'report' | 'view') {
    if (!('geolocation' in navigator)) { setGeoError('Questo browser non può dirci dove sei. Scegli il punto sulla mappa.'); return; }
    setLocating(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const p = { lat: coords.latitude, lng: coords.longitude };
        if (!inPisa(p.lat, p.lng)) { setGeoError('Sembri fuori da Pisa: per ora OpenWay funziona solo qui. Scegli il punto sulla mappa.'); return; }
        setUserPos(p);
        setFocus({ coords: [[p.lat, p.lng]], nonce: Date.now() });
        if (target === 'from') changeFrom({ ...p, label: 'La mia posizione' });
        else if (target === 'report') setReportPoint(p);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED
          ? 'Non possiamo vedere dove sei perché il permesso è stato negato. Scegli il punto sulla mappa.'
          : 'Non riusciamo a trovare la tua posizione. Scegli il punto sulla mappa.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  /**
   * Calcola il percorso tra partenza e arrivo. Con keep=true (ricalcolo dopo una segnalazione) il percorso attuale
   * resta visibile finché arriva il nuovo e un errore non lo cancella. Le risposte superate da una richiesta
   * più recente vengono scartate.
   */
  async function calculate(opts: { keep?: boolean } = {}): Promise<{ ok: true; route: RouteResult } | { ok: false; message: string } | { stale: true }> {
    if (!from || !to) return { ok: false, message: 'Scegli partenza e arrivo.' };
    const id = ++requestId.current;
    setRouteLoading(true); setRouteError(null);
    if (!opts.keep) { setRoute(null); setFootRoute(null); setSelection(null); setRecalc(null); }
    // Il percorso a piedi serve solo al confronto: se non arriva, il percorso principale resta valido.
    const [main, foot] = await Promise.allSettled([api.route(from, to), api.route(from, to, 'foot')]);
    if (id !== requestId.current) return { stale: true };
    setRouteLoading(false);
    if (main.status === 'rejected') {
      const message = (main.reason as Error).message;
      if (!opts.keep) setRouteError(message);
      return { ok: false, message };
    }
    const footR = foot.status === 'fulfilled' ? foot.value : null;
    setRoute(main.value);
    setFootRoute(footR);
    setFocus({ coords: [...main.value.coords, ...(footR?.coords ?? [])], nonce: Date.now() });
    return { ok: true, route: main.value };
  }

  function select(s: Selection) {
    setSelection(s);
    setSheetOpen(true);
    if (!s) return;
    const coords = s.type === 'report' ? [[s.report.lat, s.report.lng] as [number, number]]
      : s.feature.geometry.type === 'point' ? [s.feature.geometry.coords] : s.feature.geometry.coords;
    setFocus({ coords, nonce: Date.now() });
  }

  function upsertReport(r: Report) {
    setReports((rs) => rs.some((x) => x.id === r.id) ? rs.map((x) => x.id === r.id ? r : x) : [...rs, r]);
    if (selection?.type === 'report' && selection.report.id === r.id) setSelection({ type: 'report', report: r });
  }

  /** Dopo una segnalazione: si ricalcola solo se l'ostacolo va evitato ed è davvero sul percorso attivo. */
  async function onReportCreated(r: Report) {
    upsertReport(r);
    if (!route || !from || !to) { setRecalc(null); return; }
    const decision = rerouteDecision(r, route.coords);
    if (decision !== 'reroute') { setRecalc({ kind: decision }); return; }
    setRecalc({ kind: 'running' });
    const res = await calculate({ keep: true });
    if ('stale' in res) return;
    if (!res.ok) { setRecalc({ kind: 'error', message: res.message }); return; }
    if (res.route.mode !== 'wheelchair') { setRecalc({ kind: 'error', message: res.route.notice ?? 'Il servizio dei percorsi per sedia a rotelle non risponde.' }); return; }
    // Si dichiara "aggiornato" solo se la geometria del nuovo percorso non passa più dall'ostacolo.
    setRecalc({ kind: avoids(res.route.coords, r) ? 'updated' : 'no-alternative' });
  }

  function startReport() {
    setTab('report'); setSelection(null); setSheetOpen(true);
    if (!reportPoint) setPickMode('report');
  }

  return (
    <div className="app">
      <MapView features={features} reports={reports} layers={layers} route={route} from={from} to={to}
        compareRoute={route?.mode === 'wheelchair' && showFoot ? footRoute : null}
        alerts={route && analysis ? routeAlerts(route, analysis) : []}
        onAlert={(a) => (a.selection ? select(a.selection) : setFocus({ coords: a.focus, nonce: Date.now() }))}
        reportPoint={reportPoint} userPos={userPos} pickMode={pickMode} selection={selection} focus={focus}
        onPick={onPick} onSelect={select} />

      <p className="brand-pill glass" aria-hidden="true"><img className="brand__mark" src="/logo.png" alt="" />OpenWay</p>

      <MapControls layers={layers} onLayers={setLayers} osmDate={osm?.fetchedAt}
        onLocate={() => locate('view')} locating={locating} />

      {pickMode && (
        <div className="pickbar" role="status">
          <span>{PICK_PROMPT[pickMode]}</span>
          <button type="button" className="btn btn--sm pickbar__cancel" onClick={() => { setPickModeRaw(null); setSheetOpen(true); }}>Annulla</button>
        </div>
      )}

      <aside ref={sheetRef} className={`sheet glass${sheetOpen ? '' : ' sheet--collapsed'}`} aria-label="Pannello OpenWay">
        <button type="button" className="sheet__handle" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}>
          <span aria-hidden="true" className="sheet__grip" />
          <span className="sr-only">{sheetOpen ? 'Riduci pannello' : 'Espandi pannello'}</span>
        </button>
        <header className="sheet__header">
          <div className="brand">
            <img className="brand__mark" src="/logo.png" alt="" width="34" height="34" />
            <div>
              <h1 className="brand__name">OpenWay</h1>
              <p className="brand__place">Freedom to move · Pisa</p>
            </div>
          </div>
          <div className="tabs" role="group" aria-label="Sezioni">
            <button type="button" aria-pressed={tab === 'route' && !selection} className="tab"
              onClick={() => { setTab('route'); setSelection(null); setSheetOpen(true); }}>Percorso</button>
            <button type="button" aria-pressed={tab === 'report' && !selection} className="tab"
              onClick={startReport}>Segnala un ostacolo</button>
          </div>
        </header>
        <div className="sheet__body">
          {loadError && <p className="msg msg--warn" role="status">{loadError}</p>}
          {geoError && <p className="msg msg--error" role="alert">{geoError}</p>}
          {selection ? (
            <DetailPanel selection={selection} status={status} onClose={() => setSelection(null)} onUpdated={upsertReport} />
          ) : tab === 'route' ? (
            <RoutePanel from={from} to={to} setFrom={changeFrom} setTo={changeTo} pickMode={pickMode} setPickMode={setPickMode}
              onLocate={locate} locating={locating} onCalculate={() => void calculate()} loading={routeLoading} error={routeError}
              recalc={recalc} onDismissRecalc={() => setRecalc(null)}
              onPosition={(c) => setUserPos({ lat: c[0], lng: c[1] })}
              route={route} analysis={analysis} footRoute={footRoute} footAnalysis={footAnalysis}
              showFoot={showFoot} setShowFoot={setShowFoot} onSelect={select}
              onFocus={(coords) => setFocus({ coords, nonce: Date.now() })} />
          ) : (
            <ReportPanel point={reportPoint} setPoint={setReportPoint} pickMode={pickMode} setPickMode={setPickMode}
              onLocate={locate} locating={locating} status={status}
              onCreated={onReportCreated} onShow={(r) => select({ type: 'report', report: r })}
              hasRoute={route !== null} recalc={recalc} onShowRoute={() => { setTab('route'); setSelection(null); }} />
          )}
        </div>
      </aside>
    </div>
  );
}
