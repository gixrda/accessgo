import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { Circle, CircleMarker, MapContainer, Marker, Pane, Polyline, Rectangle, TileLayer, Tooltip, useMap, useMapEvents } from 'react-leaflet';
import { DEMO_BBOX, PISA_BOUNDS, type LatLngTuple, type OsmFeature, type Report, type RouteResult } from '../../shared/types.ts';
import { CATEGORY_ICON, CATEGORY_LABEL, CERTAINTY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import { iconSvg, type IconName } from '../lib/icons.ts';
import { clipLineToRoute, scopedMapData, withMapSelection, type MapScope } from '../lib/mapScope.ts';
import type { RouteAnalysis } from '../lib/analysis.ts';
import { observeMapSize } from '../lib/mapResize.ts';

export type Layers = Record<'known' | 'possible' | 'positive' | 'info' | 'places' | 'reports', boolean>;
export type Selection = { type: 'feature'; feature: OsmFeature } | { type: 'report'; report: Report } | null;
export type Focus = { coords: LatLngTuple[]; nonce: number } | null;
export type PickMode = 'from' | 'to' | 'report' | `via:${string}` | null;
type Place = { lat: number; lng: number; label: string };

interface Props {
  features: OsmFeature[];
  reports: Report[];
  layers: Layers;
  scope: MapScope;
  analysis: RouteAnalysis | null;
  route: RouteResult | null;
  /** Percorso a piedi mostrato per confronto */
  compareRoute: RouteResult | null;
  from: Place | null;
  to: Place | null;
  via?: { id: string; place: Place | null }[];
  reportPoint: { lat: number; lng: number } | null;
  userPos: { lat: number; lng: number } | null;
  locationPreview?: { lat: number; lng: number; accuracy: number } | null;
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
  const key = `report-${r.category}-${r.status}-${selected}`;
  return divIcon(key,
    `<span class="pin pin--${r.status}${selected ? ' is-selected' : ''}">${iconSvg(CATEGORY_ICON[r.category] as IconName, 16)}<b class="pin__badge">${badge}</b></span>`,
    [34, 42], [17, 40]);
}

const endpointIcon = (letter: string) =>
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
    // A cached route can resolve in the same render as a sheet-size change.
    map.invalidateSize({ animate: false, pan: true });
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    if (reducedMotion) {
      map.stop();
      if (focus.coords.length === 1) map.setView(focus.coords[0], Math.max(map.getZoom(), 18), { animate: false });
      else map.fitBounds(L.latLngBounds(focus.coords), { padding: [48, 48], animate: false, maxZoom: 18 });
    } else if (focus.coords.length === 1) map.flyTo(focus.coords[0], Math.max(map.getZoom(), 18), { duration: 0.6 });
    else map.flyToBounds(L.latLngBounds(focus.coords), { padding: [48, 48], duration: 0.6, maxZoom: 18 });
  }, [focus, map]);
  return null;
}

function ResizeController() {
  const map = useMap();
  useEffect(() => observeMapSize(map), [map]);
  return null;
}

function visible(f: OsmFeature, layers: Layers): boolean {
  if (f.scope === 'place') return layers.places;
  if (f.certainty === 'known_obstacle') return layers.known;
  if (f.certainty === 'possible_issue') return layers.possible;
  if (f.certainty === 'positive_info') return layers.positive;
  return layers.info && f.geometry.type === 'point'; // le linee "info" servono solo al calcolo della copertura
}

export function MapView(p: Props) {
  // In modalità selezione, toccare un marker o una linea imposta il punto invece di aprirne il dettaglio.
  const clickHandler = (sel: NonNullable<Selection>) => ({
    click: (e: L.LeafletMouseEvent) => p.pickMode ? p.onPick({ lat: e.latlng.lat, lng: e.latlng.lng }) : p.onSelect(sel),
  });
  const selId = p.selection?.type === 'feature' ? p.selection.feature.id : p.selection?.report.id;
  const scoped = useMemo(() => scopedMapData(p.features, p.reports, p.analysis, p.scope), [p.features, p.reports, p.analysis, p.scope]);
  // A chosen comparison/detail item is the sole exception to the route filter.
  const data = useMemo(() => withMapSelection(scoped, p.selection), [scoped, p.selection]);
  const shown = useMemo(() => {
    const nearbyIds = new Set(scoped.features.map((feature) => feature.id));
    return data.features.filter((feature) => visible(feature, p.layers) || feature.id === selId).map((feature) => ({
      feature,
      paths: feature.geometry.type === 'line'
        ? p.scope === 'route' && p.route && nearbyIds.has(feature.id)
          ? clipLineToRoute(feature.geometry.coords, p.route.coords) : [feature.geometry.coords]
        : [],
    }));
  }, [data.features, scoped.features, p.layers, p.scope, p.route, selId]);
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
      className={`map${p.pickMode ? ' map--picking' : ''}`}
      aria-label="Mappa di Pisa con ostacoli e segnalazioni"
    >
      <TileLayer
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
      />
      <MapEvents pickMode={p.pickMode} onPick={p.onPick} />
      <FocusController focus={p.focus} />
      <ResizeController />
      <Rectangle bounds={[[s, w], [n, e]]} interactive={false} pathOptions={{ color: '#1F3A5F', weight: 1.5, dashArray: '6 6', fill: false, opacity: 0.6 }} />

      {/* Separate panes keep a late comparison below the main route, regardless of arrival order.
          Obstacles retain Leaflet's overlay pane (400), and markers remain above both routes. */}
      <Pane name="route-comparison" style={{ zIndex: 380, pointerEvents: 'none' }}>
        {p.compareRoute && (
          <>
            <Polyline positions={p.compareRoute.coords} interactive={false} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85 }} />
            <Polyline positions={p.compareRoute.coords} interactive={false}
              pathOptions={{ color: '#3B4350', weight: 4, dashArray: '1 9', lineCap: 'round' }} />
          </>
        )}
      </Pane>
      <Pane name="route-main" style={{ zIndex: 390, pointerEvents: 'none' }}>
        {p.route && (
          <>
            <Polyline positions={p.route.coords} interactive={false} pathOptions={{ color: '#ffffff', weight: 11, opacity: 0.9 }} />
            <Polyline
              positions={p.route.coords}
              interactive={false}
              pathOptions={p.route.mode === 'wheelchair'
                ? { color: '#0B5CAD', weight: 6 }
                : { color: '#0B5CAD', weight: 6, dashArray: '10 8', lineCap: 'butt' }}
            />
          </>
        )}
      </Pane>

      {shown.map(({ feature: f, paths }) => f.geometry.type === 'line' ? (paths.length > 0 && (
        <Polyline
          key={f.id}
          positions={paths}
          bubblingMouseEvents={false}
          pathOptions={{ ...LINE_STYLE[CERTAINTY_CLASS[f.certainty]], ...(f.id === selId ? { weight: 9 } : {}) }}
          eventHandlers={clickHandler({ type: 'feature', feature: f })}
        />
      )) : (
        <Marker
          key={f.id}
          position={f.geometry.coords}
          icon={featureIcon(f, f.id === selId)}
          bubblingMouseEvents={false}
          // Centinaia di marker non devono finire nell'ordine di tabulazione: da tastiera si usa l'elenco nel pannello percorso.
          keyboard={false}
          title={`${CERTAINTY_LABEL[f.certainty]}: ${f.label}`}
          eventHandlers={clickHandler({ type: 'feature', feature: f })}
        />
      ))}

      {data.reports.filter((report) => p.layers.reports || report.id === selId).map((r) => (
        <Marker
          key={r.id}
          position={[r.lat, r.lng]}
          icon={reportIcon(r, r.id === selId)}
          bubblingMouseEvents={false}
          title={`Segnalazione ${STATUS_LABEL[r.status].toLowerCase()}: ${CATEGORY_LABEL[r.category]}`}
          alt={`Segnalazione ${STATUS_LABEL[r.status].toLowerCase()}: ${CATEGORY_LABEL[r.category]}`}
          zIndexOffset={500}
          eventHandlers={clickHandler({ type: 'report', report: r })}
        />
      ))}

      {p.reportPoint && <Marker position={[p.reportPoint.lat, p.reportPoint.lng]} icon={draftIcon} keyboard={false} zIndexOffset={900} title="Posizione della nuova segnalazione" />}
      {p.from && <Marker position={[p.from.lat, p.from.lng]} icon={endpointIcon('A')} keyboard={false} zIndexOffset={1000} title={`Partenza: ${p.from.label}`} />}
      {(p.via ?? []).map((stop, index) => stop.place && <Marker key={stop.id}
        position={[stop.place.lat, stop.place.lng]} icon={endpointIcon(String.fromCharCode(66 + index))}
        keyboard={false} zIndexOffset={1000} title={`Tappa ${index + 1}: ${stop.place.label}`} />)}
      {p.to && <Marker position={[p.to.lat, p.to.lng]} icon={endpointIcon(String.fromCharCode(66 + (p.via?.length ?? 0)))} keyboard={false} zIndexOffset={1000} title={`Destinazione: ${p.to.label}`} />}
      {p.userPos && (
        <CircleMarker center={[p.userPos.lat, p.userPos.lng]} radius={8} interactive={false}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#0B5CAD', fillOpacity: 1 }} />
      )}
      {p.locationPreview && <Circle center={[p.locationPreview.lat, p.locationPreview.lng]} radius={p.locationPreview.accuracy}
        pathOptions={{ color: '#b54800', weight: 2, dashArray: '5 5', fillOpacity: 0.12 }}>
        <Tooltip permanent>Posizione approssimativa · da confermare</Tooltip>
      </Circle>}
    </MapContainer>
  );
}
