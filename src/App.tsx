import { useCallback, useEffect, useMemo, useState } from 'react';
import { inPisa, type OsmDataset, type Report, type RouteResult, type ServerStatus } from '../shared/types.ts';
import { api } from './api.ts';
import { DetailPanel } from './components/DetailPanel.tsx';
import { LayersControl } from './components/LayersControl.tsx';
import { MapView, type Focus, type Layers, type PickMode, type Selection } from './components/MapView.tsx';
import { ReportPanel } from './components/ReportPanel.tsx';
import { RoutePanel } from './components/RoutePanel.tsx';
import { analyzeRoute, routeObstacles } from './lib/analysis.ts';

type Place = { lat: number; lng: number; label: string };
type Tab = 'route' | 'report';

const PICK_PROMPT: Record<Exclude<PickMode, null>, string> = {
  from: 'Tocca la mappa per scegliere la partenza',
  to: 'Tocca la mappa per scegliere la destinazione',
  report: "Tocca il punto esatto dell'ostacolo",
};

function placeFromUrl(key: string, label: string): Place | null {
  const [lat, lng] = (new URLSearchParams(window.location.search).get(key) ?? '').split(',').map(Number);
  return inPisa(lat, lng) ? { lat, lng, label: `${label} (${lat.toFixed(4)}, ${lng.toFixed(4)})` } : null;
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

  // ?from=lat,lng&to=lat,lng precompila partenza e destinazione (link ripetibili per la demo).
  const [from, setFrom] = useState<Place | null>(() => placeFromUrl('from', 'Partenza dal link'));
  const [to, setTo] = useState<Place | null>(() => placeFromUrl('to', 'Destinazione dal link'));
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [footRoute, setFootRoute] = useState<RouteResult | null>(null);
  const [showFoot, setShowFoot] = useState(true);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const [reportPoint, setReportPoint] = useState<{ lat: number; lng: number } | null>(null);
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    // Ogni sorgente fallisce in modo indipendente: la mappa resta utilizzabile anche senza dati OSM o segnalazioni.
    api.status().then(setStatus).catch(() => setStatus(null));
    api.osm().then(setOsm).catch(() => setLoadError('Dati OpenStreetMap non disponibili: ostacoli noti non mostrati.'));
    api.reports().then(setReports).catch(() => setLoadError('Segnalazioni non disponibili al momento.'));
  }, []);

  const features = useMemo(() => osm?.features ?? [], [osm]);
  const analysis = useMemo(() => route ? analyzeRoute(route.coords, features, reports) : null, [route, features, reports]);
  const footAnalysis = useMemo(() => footRoute ? analyzeRoute(footRoute.coords, features, reports) : null, [footRoute, features, reports]);

  const setPickMode = useCallback((m: PickMode) => {
    setPickModeRaw(m);
    if (m && window.matchMedia('(max-width: 759px)').matches) setSheetOpen(false); // libera la mappa su smartphone
  }, []);

  // Un nuovo punto invalida il percorso precedente.
  const changeFrom = (p: Place | null) => { setFrom(p); setRoute(null); setFootRoute(null); setRouteError(null); };
  const changeTo = (p: Place | null) => { setTo(p); setRoute(null); setFootRoute(null); setRouteError(null); };

  function onPick(p: { lat: number; lng: number }) {
    const label = `Punto sulla mappa (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`;
    if (pickMode === 'from') changeFrom({ ...p, label });
    if (pickMode === 'to') changeTo({ ...p, label });
    if (pickMode === 'report') setReportPoint(p);
    setPickModeRaw(null);
    setGeoError(null);
    setSheetOpen(true);
  }

  function locate(target: 'from' | 'report') {
    if (!('geolocation' in navigator)) { setGeoError('Geolocalizzazione non supportata da questo browser.'); return; }
    setLocating(true); setGeoError(null);
    navigator.geolocation.getCurrentPosition(
      ({ coords }) => {
        setLocating(false);
        const p = { lat: coords.latitude, lng: coords.longitude };
        if (!inPisa(p.lat, p.lng)) { setGeoError('Sei fuori dall\'area di Pisa coperta da AccessGo: scegli il punto sulla mappa.'); return; }
        setUserPos(p);
        setFocus({ coords: [[p.lat, p.lng]], nonce: Date.now() });
        if (target === 'from') changeFrom({ ...p, label: 'La mia posizione' });
        else setReportPoint(p);
      },
      (err) => {
        setLocating(false);
        setGeoError(err.code === err.PERMISSION_DENIED
          ? 'Permesso di geolocalizzazione negato. Seleziona il punto sulla mappa.'
          : 'Posizione non disponibile. Seleziona il punto sulla mappa.');
      },
      { enableHighAccuracy: true, timeout: 10_000 },
    );
  }

  async function calculate() {
    if (!from || !to) return;
    setRouteLoading(true); setRouteError(null); setRoute(null); setFootRoute(null); setSelection(null);
    // Il percorso a piedi serve solo al confronto: se non arriva, il percorso principale resta valido.
    const [main, foot] = await Promise.allSettled([api.route(from, to), api.route(from, to, 'foot')]);
    setRouteLoading(false);
    if (main.status === 'rejected') { setRouteError((main.reason as Error).message); return; }
    const footR = foot.status === 'fulfilled' ? foot.value : null;
    setRoute(main.value);
    setFootRoute(footR);
    setFocus({ coords: [...main.value.coords, ...(footR?.coords ?? [])], nonce: Date.now() });
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

  function startReport() {
    setTab('report'); setSelection(null); setSheetOpen(true);
    if (!reportPoint) setPickMode('report');
  }

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">A</span>
          <div>
            <h1 className="brand__name">AccessGo</h1>
            <p className="brand__place">Pisa · zona universitaria</p>
          </div>
        </div>
        <ul className="services" aria-label="Stato dei servizi">
          <li className="chip chip--ok">
            Routing sedia a rotelle: {status?.routing === 'openrouteservice' ? 'OpenRouteService' : 'Valhalla'}
          </li>
          <li className={`chip ${status && status.ai !== 'fallback' ? 'chip--ok' : 'chip--warn'}`}>
            Interpretazione: {status && status.ai !== 'fallback' ? 'Gemma' : 'regole (fallback)'}
          </li>
        </ul>
        <button type="button" className="btn btn--accent topbar__cta" onClick={startReport}>+ Segnala ostacolo</button>
      </header>

      <main className="main">
        <aside className={`sheet${sheetOpen ? '' : ' sheet--collapsed'}`} aria-label="Pannello AccessGo">
          <button type="button" className="sheet__handle" onClick={() => setSheetOpen(!sheetOpen)} aria-expanded={sheetOpen}>
            <span aria-hidden="true" className="sheet__grip" />
            <span className="sr-only">{sheetOpen ? 'Riduci pannello' : 'Espandi pannello'}</span>
          </button>
          <div className="tabs" role="group" aria-label="Sezioni">
            <button type="button" aria-pressed={tab === 'route' && !selection} className="tab"
              onClick={() => { setTab('route'); setSelection(null); setSheetOpen(true); }}>Percorso</button>
            <button type="button" aria-pressed={tab === 'report' && !selection} className="tab"
              onClick={() => { setTab('report'); setSelection(null); setSheetOpen(true); }}>Segnala</button>
          </div>
          <div className="sheet__body">
            {loadError && <p className="msg msg--warn" role="status">{loadError}</p>}
            {geoError && <p className="msg msg--error" role="alert">{geoError}</p>}
            {selection ? (
              <DetailPanel selection={selection} status={status} onClose={() => setSelection(null)} onUpdated={upsertReport} />
            ) : tab === 'route' ? (
              <RoutePanel from={from} to={to} setFrom={changeFrom} setTo={changeTo} pickMode={pickMode} setPickMode={setPickMode}
                onLocate={locate} locating={locating} onCalculate={calculate} loading={routeLoading} error={routeError}
                route={route} analysis={analysis} footRoute={footRoute} footAnalysis={footAnalysis}
                showFoot={showFoot} setShowFoot={setShowFoot} onSelect={select}
                onFocus={(coords) => setFocus({ coords, nonce: Date.now() })} />
            ) : (
              <ReportPanel point={reportPoint} setPoint={setReportPoint} pickMode={pickMode} setPickMode={setPickMode}
                onLocate={locate} locating={locating} status={status}
                onCreated={upsertReport} onShow={(r) => select({ type: 'report', report: r })} />
            )}
            <p className="disclaimer">Prototipo per hackathon. I percorsi e i dati non sono verificati sul posto: valuta sempre la situazione reale.</p>
          </div>
        </aside>

        <div className="map-area">
          <MapView features={features} reports={reports} layers={layers} route={route} from={from} to={to}
            compareRoute={route?.mode === 'wheelchair' && showFoot ? footRoute : null}
            obstacles={analysis ? routeObstacles(analysis) : []}
            reportPoint={reportPoint} userPos={userPos} pickMode={pickMode} selection={selection} focus={focus}
            onPick={onPick} onSelect={select} />
          <LayersControl layers={layers} onChange={setLayers} osmDate={osm?.fetchedAt} />
          {pickMode && (
            <div className="pickbar" role="status">
              <span>{PICK_PROMPT[pickMode]}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setPickModeRaw(null); setSheetOpen(true); }}>Annulla</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
