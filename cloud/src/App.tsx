import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { inPisa, type OsmDataset, type Report, type ServerStatus } from '../shared/types.ts';
import { api } from './api.ts';
import { DetailPanel } from './components/DetailPanel.tsx';
import { LayersControl } from './components/LayersControl.tsx';
import { MapView, type Focus, type Layers, type PickMode, type Selection } from './components/MapView.tsx';
import { ReportPanel } from './components/ReportPanel.tsx';
import { RoutePanel } from './components/RoutePanel.tsx';
import { analyzeRoute } from './lib/analysis.ts';
import { clipLineToRoute, selectionIsOutsideRoute, type MapScope } from './lib/mapScope.ts';
import { useRoutePlanner } from './hooks/useRoutePlanner.ts';
import { useReportDraft } from './hooks/useReportDraft.ts';
import { readReportSignInDraft } from './lib/reportSession.ts';
import { MOBILE_LAYOUT, useMobileLayout, useAppViewport } from './hooks/useMobileLayout.ts';
import { dismissKeyboard, keepFocusedFieldVisible } from './lib/formViewport.ts';

type Tab = 'route' | 'report';
type SheetMode = 'peek' | 'half' | 'full';

const PICK_PROMPT: Record<'from' | 'to' | 'report', string> = {
  from: 'Tocca la mappa per scegliere la partenza',
  to: 'Tocca la mappa per scegliere la destinazione',
  report: "Tocca il punto esatto dell'ostacolo",
};

export default function App() {
  const [status, setStatus] = useState<ServerStatus | null>(null);
  const [osm, setOsm] = useState<OsmDataset | null>(null);
  const [reports, setReports] = useState<Report[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [tab, setTab] = useState<Tab>(() => readReportSignInDraft() ? 'report' : 'route');
  const [sheetMode, setSheetMode] = useState<SheetMode>('half');
  const [actionsTarget, setActionsTarget] = useState<HTMLDivElement | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const mobile = useMobileLayout();
  const viewport = useAppViewport();
  const [layers, setLayers] = useState<Layers>({ known: true, possible: true, positive: false, info: true, places: false, reports: true });
  const [mapScope, setMapScope] = useState<MapScope>('route');
  const [pickMode, setPickModeRaw] = useState<PickMode>(null);
  const [selection, setSelection] = useState<Selection>(null);
  const [focus, setFocus] = useState<Focus>(null);
  const activeView = useRef({ tab, pickMode, selection });
  activeView.current = { tab, pickMode, selection };

  const { from, to, via, changeFrom, changeTo, addVia, changeVia, removeVia, moveVia, reverse, route, footRoute, routeLoading, routeError, calculate } = useRoutePlanner({
    onFocus: (coords) => {
      // A slow route must not move the map while someone is placing a report pin.
      const view = activeView.current;
      if (view.tab === 'route' && !view.pickMode && !view.selection) setFocus({ coords, nonce: Date.now() });
    },
  });
  const [showFoot, setShowFoot] = useState(true);
  const reportDraft = useReportDraft(upsertReport);
  const { point: reportPoint, setPoint: setReportPoint } = reportDraft;
  const [userPos, setUserPos] = useState<{ lat: number; lng: number } | null>(null);
  const [locating, setLocating] = useState(false);
  const [geoError, setGeoError] = useState<string | null>(null);

  useEffect(() => {
    // Ogni sorgente fallisce in modo indipendente: la mappa resta utilizzabile anche senza dati OSM o segnalazioni.
    api.status().then(setStatus).catch(() => setStatus(null));
    api.osm().then(setOsm).catch(() => setLoadError('Dati OpenStreetMap non disponibili: ostacoli noti non mostrati.'));
    api.reports().then(setReports).catch(() => setLoadError('Segnalazioni non disponibili al momento.'));
  }, []);

  useEffect(() => {
    if (bodyRef.current) bodyRef.current.scrollTop = 0;
  }, [tab, selection]);

  useEffect(() => {
    const body = bodyRef.current;
    if (!mobile || !body) return;
    let frame = 0;
    const reveal = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => keepFocusedFieldVisible(body));
    };
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(reveal);
    observer?.observe(body);
    body.addEventListener('focusin', reveal);
    reveal();
    return () => {
      observer?.disconnect();
      body.removeEventListener('focusin', reveal);
      cancelAnimationFrame(frame);
    };
  }, [mobile, viewport.height, viewport.keyboardOpen]);

  const features = useMemo(() => osm?.features ?? [], [osm]);
  const analysis = useMemo(() => route ? analyzeRoute(route.coords, features, reports) : null, [route, features, reports]);
  const footAnalysis = useMemo(() => footRoute ? analyzeRoute(footRoute.coords, features, reports) : null, [footRoute, features, reports]);

  useEffect(() => { setSelection(null); }, [from, to, via]);

  const keyboardEditing = viewport.keyboardOpen && !pickMode;
  const selectedOutside = mapScope === 'route' && selectionIsOutsideRoute(selection, analysis);

  const setPickMode = useCallback((m: PickMode) => {
    if (m) dismissKeyboard();
    setPickModeRaw(m);
    if (m && window.matchMedia(MOBILE_LAYOUT).matches) setSheetMode('peek');
  }, []);

  function onPick(p: { lat: number; lng: number }) {
    const label = `Punto sulla mappa (${p.lat.toFixed(4)}, ${p.lng.toFixed(4)})`;
    if (pickMode === 'from') changeFrom({ ...p, label });
    if (pickMode === 'to') changeTo({ ...p, label });
    if (pickMode?.startsWith('via:')) changeVia(pickMode.slice(4), { ...p, label });
    if (pickMode === 'report') setReportPoint(p);
    setPickModeRaw(null);
    setGeoError(null);
    setSheetMode('half');
  }

  function locate(target: 'from' | 'report') {
    dismissKeyboard();
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

  function select(s: Selection) {
    setSelection(s);
    setSheetMode('half');
    if (!s) return;
    let coords = s.type === 'report' ? [[s.report.lat, s.report.lng] as [number, number]]
      : s.feature.geometry.type === 'point' ? [s.feature.geometry.coords] : s.feature.geometry.coords;
    if (s.type === 'feature' && s.feature.geometry.type === 'line' && mapScope === 'route' && route && !selectionIsOutsideRoute(s, analysis)) {
      const clipped = clipLineToRoute(s.feature.geometry.coords, route.coords).flat();
      if (clipped.length) coords = clipped;
    }
    setFocus({ coords, nonce: Date.now() });
  }

  function upsertReport(r: Report) {
    setReports((rs) => rs.some((x) => x.id === r.id) ? rs.map((x) => x.id === r.id ? r : x) : [...rs, r]);
    if (selection?.type === 'report' && selection.report.id === r.id) setSelection({ type: 'report', report: r });
  }

  function startReport() {
    dismissKeyboard();
    setTab('report'); setSelection(null); setSheetMode('half'); setPickModeRaw(null);
    if (!reportPoint && !reportDraft.created && !reportDraft.submitting) setPickMode('report');
  }

  return (
    <div className={`app${keyboardEditing ? ' app--keyboard' : ''}`}
      style={{ height: viewport.height, top: viewport.top }}>
      <header className="topbar">
        <div className="brand">
          <span className="brand__mark" aria-hidden="true">A</span>
          <div>
            <h1 className="brand__name">AccessGo</h1>
            <p className="brand__place">Pisa · zona universitaria</p>
          </div>
        </div>
        <ul className="services" aria-label="Stato dei servizi">
          <li className={`chip ${status ? 'chip--ok' : 'chip--warn'}`}>
            Routing sedia a rotelle: {!status ? 'stato non disponibile' : status.routing === 'openrouteservice' ? 'OpenRouteService' : 'Valhalla'}
          </li>
          <li className={`chip ${status && status.ai !== 'fallback' ? 'chip--ok' : 'chip--warn'}`}>
            Interpretazione: {!status ? 'stato non disponibile' : status.ai !== 'fallback' ? 'Gemma' : 'regole (fallback)'}
          </li>
        </ul>
        <button type="button" className="btn btn--accent topbar__cta" onClick={startReport}>+ Segnala ostacolo</button>
        {keyboardEditing && <button type="button" className="btn keyboard-done"
          aria-label="Chiudi tastiera" onClick={dismissKeyboard}>Fine</button>}
      </header>

      <main className={`main main--${sheetMode}`}>
        <aside className={`sheet sheet--${sheetMode}`} aria-label="Pannello AccessGo">
          <div className="sheet__tools">
            <button type="button" className="sheet__handle" onClick={() => setSheetMode(sheetMode === 'peek' ? 'half' : 'peek')}
              aria-controls="sheet-body" aria-expanded={sheetMode !== 'peek'}>
              {sheetMode === 'peek' ? 'Mostra pannello' : 'Mostra mappa'}
            </button>
            {sheetMode !== 'peek' && <button type="button" className="sheet__handle" aria-controls="sheet-body"
              onClick={() => setSheetMode(sheetMode === 'full' ? 'half' : 'full')}>
              {sheetMode === 'full' ? 'Riduci pannello' : 'Espandi pannello'}
            </button>}
          </div>
          <div className="tabs" role="group" aria-label="Sezioni">
            <button type="button" aria-pressed={tab === 'route' && !selection} className="tab"
              onClick={() => { dismissKeyboard(); setTab('route'); setSelection(null); setPickModeRaw(null); setSheetMode('half'); }}>Percorso</button>
            <button type="button" aria-pressed={tab === 'report' && !selection} className="tab"
              onClick={() => { dismissKeyboard(); setTab('report'); setSelection(null); setPickModeRaw(null); setSheetMode('half'); }}>Segnala</button>
          </div>
          <div id="sheet-body" className="sheet__body" ref={bodyRef}>
            {loadError && <p className="msg msg--warn" role="status">{loadError}</p>}
            {geoError && <p className="msg msg--error" role="alert">{geoError}</p>}
            {selection ? (
              <DetailPanel selection={selection} status={status} onClose={() => setSelection(null)} onUpdated={upsertReport} />
            ) : tab === 'route' ? (
              <RoutePanel onNavigationPosition={([lat, lng]) => setUserPos({ lat, lng })} from={from} to={to} via={via} onAddVia={addVia} onChangeVia={changeVia} onRemoveVia={removeVia} onMoveVia={moveVia} onReverse={reverse} setFrom={changeFrom} setTo={changeTo} pickMode={pickMode} setPickMode={setPickMode}
                onLocate={locate} locating={locating} onCalculate={() => {
                  dismissKeyboard(); setSelection(null); setSheetMode('half'); void calculate();
                }} loading={routeLoading} error={routeError}
                route={route} analysis={analysis} footRoute={footRoute} footAnalysis={footAnalysis}
                showFoot={showFoot} setShowFoot={setShowFoot} onSelect={select} actionsTarget={actionsTarget} />
            ) : (
              <ReportPanel draft={reportDraft} pickMode={pickMode} setPickMode={setPickMode}
                onLocate={locate} locating={locating} status={status}
                onShow={(r) => select({ type: 'report', report: r })} actionsTarget={actionsTarget} />
            )}
            <p className="disclaimer">Prototipo per hackathon. I percorsi e i dati non sono verificati sul posto: valuta sempre la situazione reale.</p>
          </div>
          <div className="sheet__actions" ref={setActionsTarget} />
        </aside>

        <div className="map-area">
          <MapView features={features} reports={reports} layers={layers} scope={mapScope} analysis={analysis} route={route} from={from} to={to} via={via}
            compareRoute={route?.mode === 'wheelchair' && showFoot ? footRoute : null}
            reportPoint={reportPoint} userPos={userPos} pickMode={pickMode} selection={selection} focus={focus}
            onPick={onPick} onSelect={select} />
          <LayersControl layers={layers} onChange={setLayers} osmDate={osm?.fetchedAt}
            scope={mapScope} onScopeChange={setMapScope} hasRoute={Boolean(route)} />
          {!pickMode && <div className="map-scope-note" role="status">
            <span>{mapScope === 'all' ? 'Esplora tutta l’area' : route ? 'Ostacoli vicini al percorso attuale' : selection ? 'Elemento selezionato · nessun percorso attivo' : 'Calcola un percorso per vedere gli ostacoli vicini'}</span>
            {selectedOutside && <span className="map-scope-note__selection"> + elemento selezionato fuori filtro</span>}
          </div>}
          {pickMode && (
            <div className="pickbar" role="status">
              <span>{pickMode.startsWith('via:') ? `Tocca la mappa per scegliere la tappa ${via.findIndex((stop) => stop.id === pickMode.slice(4)) + 1}` : PICK_PROMPT[pickMode as keyof typeof PICK_PROMPT]}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => { setPickModeRaw(null); setSheetMode('half'); }}>Annulla</button>
            </div>
          )}
        </div>
      </main>
    </div>
  );
}
