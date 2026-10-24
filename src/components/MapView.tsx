import L from 'leaflet';
import { useEffect, useMemo, useState } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Rectangle, TileLayer, useMap, useMapEvents, ZoomControl } from 'react-leaflet';
import { DEMO_BBOX, PISA_BOUNDS, type LatLngTuple, type OsmFeature, type Report, type RouteResult } from '../../shared/types.ts';
import { CATEGORY_ICON, CATEGORY_LABEL, CERTAINTY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import type { RouteAlert } from '../lib/alerts.ts';
import { iconSvg, type IconName } from '../lib/icons.ts';

export type Layers = Record<'known' | 'possible' | 'positive' | 'info' | 'places' | 'reports', boolean>;
export type Selection = { type: 'feature'; feature: OsmFeature } | { type: 'report'; report: Report } | null;
export type Focus = { coords: LatLngTuple[]; nonce: number } | null;
export type PickMode = 'from' | 'to' | 'report' | null;
type Place = { lat: number; lng: number; label: string };

interface Props {
  features: OsmFeature[];
  reports: Report[];
  layers: Layers;
  route: RouteResult | null;
  /** Percorso a piedi mostrato per confronto */
  compareRoute: RouteResult | null;
  /** Punti di attenzione sul percorso, in ordine: mostrati con il numero dell'elenco */
  alerts: RouteAlert[];
  onAlert: (a: RouteAlert) => void;
  from: Place | null;
  to: Place | null;
  reportPoint: { lat: number; lng: number } | null;
  userPos: { lat: number; lng: number } | null;
  pickMode: PickMode;
  selection: Selection;
  focus: Focus;
  onPick: (p: { lat: number; lng: number }) => void;
  onSelect: (s: Selection) => void;
}

const CERTAINTY_CLASS = { known_obstacle: 'known', possible_issue: 'possible', positive_info: 'positive', info: 'info' } as const;
const iconCache = new Map<string, L.DivIcon>();

function divIcon(key: string, html: string, size: [number, number], anchor: [number, number]): L.DivIcon {
  let icon = iconCache.get(key);
  if (!icon) {
    icon = L.divIcon({ html, className: 'mk-wrap', iconSize: size, iconAnchor: anchor });
    iconCache.set(key, icon);
  }
  return icon;
}

function featureIcon(f: OsmFeature, selected: boolean): L.DivIcon {
  const cls = CERTAINTY_CLASS[f.certainty];
  const glyph: IconName = f.scope === 'place' ? 'place' : f.kind;
  const key = `${cls}-${glyph}-${selected}`;
  return divIcon(key, `<span class="mk mk--${cls}${selected ? ' is-selected' : ''}">${iconSvg(glyph, 14)}</span>`, [26, 26], [13, 13]);
}

function reportIcon(r: Report, selected: boolean): L.DivIcon {
  const badge = r.status === 'unverified' ? '?' : '✓';
  // Ostacolo che blocca il passaggio: segnaposto rosso con il simbolo di divieto; altrimenti l'icona della categoria.
  const key = `report-${r.category}-${r.status}-${r.blocking}-${selected}`;
  const icon: IconName = r.blocking ? 'block' : CATEGORY_ICON[r.category] as IconName;
  return divIcon(key,
    `<span class="pin pin--${r.status}${r.blocking ? ' pin--blocking' : ''}${selected ? ' is-selected' : ''}">${iconSvg(icon, 16)}<b class="pin__badge">${badge}</b></span>`,
    [34, 42], [17, 40]);
}

const endpointIcon = (letter: 'A' | 'B') =>
  divIcon(`end-${letter}`, `<span class="endpoint endpoint--${letter}">${letter}</span>`, [32, 32], [16, 16]);
const draftIcon = divIcon('draft', `<span class="pin pin--draft">${iconSvg('report', 16)}</span>`, [34, 42], [17, 40]);

const LINE_STYLE: Record<string, L.PathOptions> = {
  known: { color: '#B54800', weight: 6, opacity: 0.95 },
  possible: { color: '#B07800', weight: 4, opacity: 0.9, dashArray: '2 6', lineCap: 'round' },
  positive: { color: '#00795A', weight: 4, opacity: 0.8 },
};

function MapEvents({ pickMode, onPick }: Pick<Props, 'pickMode' | 'onPick'>) {
  useMapEvents({ click: (e) => { if (pickMode) onPick({ lat: e.latlng.lat, lng: e.latlng.lng }); } });
  return null;
}

function FocusController({ focus }: { focus: Focus }) {
  const map = useMap();
  useEffect(() => {
    if (!focus || !focus.coords.length) return;
    if (focus.coords.length === 1) map.flyTo(focus.coords[0], Math.max(map.getZoom(), 18), { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(focus.coords), { padding: [48, 48], duration: 0.6, maxZoom: 18 });
  }, [focus, map]);
  return null;
}

// Da lontano si vedono solo ostacoli noti e segnalazioni; il resto compare avvicinando la mappa.
const DETAIL_ZOOM = 17;

function visible(f: OsmFeature, layers: Layers, zoom: number): boolean {
  if (f.certainty === 'known_obstacle' && f.scope === 'path') return layers.known;
  if (zoom < DETAIL_ZOOM) return false;
  if (f.scope === 'place') return layers.places;
  if (f.certainty === 'possible_issue') return layers.possible;
  if (f.certainty === 'positive_info') return layers.positive;
  return layers.info && f.geometry.type === 'point'; // le linee "info" servono solo al calcolo della copertura
}

function ZoomWatcher({ onZoom }: { onZoom: (z: number) => void }) {
  const map = useMapEvents({ zoomend: () => onZoom(map.getZoom()) });
  return null;
}

function useDarkMode(): boolean {
  const query = '(prefers-color-scheme: dark)';
  const [dark, setDark] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setDark(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return dark;
}

// Colori dei tracciati: il percorso è l'unico elemento blu sulla mappa desaturata.
const PALETTE = {
  light: { route: '#0a66d8', casing: '#ffffff', foot: '#3b4350', frame: '#475569', walk: '#ffffff' },
  dark: { route: '#4c95ff', casing: '#0b0f14', foot: '#cbd5e1', frame: '#94a3b8', walk: '#0b0f14' },
};

export function MapView(p: Props) {
  // In modalità selezione, toccare un marker o una linea imposta il punto invece di aprirne il dettaglio.
  const clickHandler = (sel: NonNullable<Selection>) => ({
    click: (e: L.LeafletMouseEvent) => p.pickMode ? p.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) : p.onSelect(sel),
  });
  const selId = p.selection?.type === 'feature' ? p.selection.feature.id : p.selection?.report.id;
  // L'elemento selezionato resta visibile anche se il suo livello è nascosto.
  const [zoom, setZoom] = useState(16);
  const dark = useDarkMode();
  const c = dark ? PALETTE.dark : PALETTE.light;
  const shown = useMemo(() => p.features.filter((f) => visible(f, p.layers, zoom) || f.id === selId), [p.features, p.layers, zoom, selId]);
  const [s, w, n, e] = DEMO_BBOX;
  const [ps, pw, pn, pe] = PISA_BOUNDS;

  return (
    <MapContainer
      center={[43.7175, 10.4005]}
      zoom={16}
      minZoom={13}
      maxZoom={19}
      maxBounds={[[ps, pw], [pn, pe]]}
      preferCanvas
      zoomControl={false}
      className={`map${p.pickMode ? ' map--picking' : ''}`}
      aria-label="Mappa di Pisa con ostacoli e segnalazioni"
    >
      {/* Tile OpenStreetMap desaturate via CSS (.tiles): percorso e ostacoli restano gli unici elementi colorati.
          Le basemap CARTO richiedono una chiave dal browser (filigrana "API KEY REQUIRED"), quindi non si usano. */}
      <TileLayer
        className="tiles"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      <ZoomControl position="bottomright" zoomInTitle="Avvicina" zoomOutTitle="Allontana" />
      <ZoomWatcher onZoom={setZoom} />
      <MapEvents pickMode={p.pickMode} onPick={p.onPick} />
      <FocusController focus={p.focus} />
      <Rectangle bounds={[[s, w], [n, e]]} interactive={false} pathOptions={{ color: c.frame, weight: 1.5, dashArray: '6 6', fill: false, opacity: 0.5 }} />

      {p.compareRoute && (
        <>
          <Polyline positions={p.compareRoute.coords} interactive={false} pathOptions={{ color: c.walk, weight: 8, opacity: 0.85 }} />
          <Polyline positions={p.compareRoute.coords} interactive={false}
            pathOptions={{ color: c.foot, weight: 4, dashArray: '1 9', lineCap: 'round' }} />
        </>
      )}
      {p.route && (
        <>
          {/* Tratti non verificati: alone ambra tratteggiato attorno al percorso, elencati anche nel pannello */}
          {p.route.safety?.segments.map((s, i) => (
            <Polyline key={`seg-${i}`} positions={s.coords} interactive={false}
              pathOptions={{ color: s.kind === 'carriageway' ? '#E8A317' : '#B54800', weight: 18, opacity: 0.9, dashArray: '8 6', lineCap: 'butt' }} />
          ))}
          <Polyline positions={p.route.coords} interactive={false} pathOptions={{ color: c.casing, weight: 11, opacity: 0.95 }} />
          <Polyline
            positions={p.route.coords}
            interactive={false}
            pathOptions={p.route.mode === 'wheelchair'
              ? { color: c.route, weight: 6 }
              : { color: c.route, weight: 6, dashArray: '10 8', lineCap: 'butt' }}
          />
        </>
      )}

      {shown.map((f) => f.geometry.type === 'line' ? (
        <Polyline
          key={f.id}
          positions={f.geometry.coords}
          pathOptions={{ ...LINE_STYLE[CERTAINTY_CLASS[f.certainty]], ...(f.id === selId ? { weight: 9 } : {}) }}
          eventHandlers={clickHandler({ type: 'feature', feature: f })}
        />
      ) : (
        <Marker
          key={f.id}
          position={f.geometry.coords}
          icon={featureIcon(f, f.id === selId)}
          // Centinaia di marker non devono finire nell'ordine di tabulazione: da tastiera si usa l'elenco nel pannello percorso.
          keyboard={false}
          title={`${CERTAINTY_LABEL[f.certainty]}: ${f.label}`}
          eventHandlers={clickHandler({ type: 'feature', feature: f })}
        />
      ))}

      {p.layers.reports && p.reports.map((r) => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          icon={reportIcon(r, r.id === selId)}
          title={`${CATEGORY_LABEL[r.category]}${r.blocking ? ', non si passa' : ''} (${STATUS_LABEL[r.status].toLowerCase()})`}
          alt={`${CATEGORY_LABEL[r.category]}${r.blocking ? ', non si passa' : ''} (${STATUS_LABEL[r.status].toLowerCase()})`}
          zIndexOffset={500}
          eventHandlers={clickHandler({ type: 'report', report: r })}
        />
      ))}

      {p.alerts.map((a, i) => (
        <Marker
          key={`num-${a.key}`}
          position={a.anchor}
          icon={divIcon(`num-${i + 1}`, `<span class="route-num">${i + 1}</span>`, [22, 22], [-6, 30])}
          keyboard={false}
          zIndexOffset={800}
          title={`${i + 1}. ${a.title}`}
          eventHandlers={{ click: (e) => (p.pickMode ? p.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) : p.onAlert(a)) }}
        />
      ))}
      {p.reportPoint && <Marker position={[p.reportPoint.lat, p.reportPoint.lng]} icon={draftIcon} keyboard={false} zIndexOffset={900} title="Posizione della nuova segnalazione" />}
      {p.from && <Marker position={[p.from.lat, p.from.lng]} icon={endpointIcon('A')} keyboard={false} zIndexOffset={1000} title={`Partenza: ${p.from.label}`} />}
      {p.to && <Marker position={[p.to.lat, p.to.lng]} icon={endpointIcon('B')} keyboard={false} zIndexOffset={1000} title={`Arrivo: ${p.to.label}`} />}
      {p.userPos && (
        <CircleMarker center={[p.userPos.lat, p.userPos.lng]} radius={8} interactive={false}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: c.route, fillOpacity: 1 }} />
      )}
    </MapContainer>
  );
}
