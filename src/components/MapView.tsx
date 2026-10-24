import L from 'leaflet';
import { useEffect, useMemo } from 'react';
import { CircleMarker, MapContainer, Marker, Polyline, Rectangle, TileLayer, useMap, useMapEvents } from 'react-leaflet';
import { DEMO_BBOX, PISA_BOUNDS, type LatLngTuple, type OsmFeature, type Report, type RouteResult } from '../../shared/types.ts';
import { CATEGORY_ICON, CATEGORY_LABEL, CERTAINTY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import type { RouteObstacle } from '../lib/analysis.ts';
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
  /** Ostacoli sul percorso, in ordine: mostrati con il numero dell'elenco */
  obstacles: RouteObstacle[];
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
  const key = `report-${r.category}-${r.status}-${selected}`;
  return divIcon(key,
    `<span class="pin pin--${r.status}${selected ? ' is-selected' : ''}">${iconSvg(CATEGORY_ICON[r.category] as IconName, 16)}<b class="pin__badge">${badge}</b></span>`,
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
  // L'elemento selezionato resta visibile anche se il suo livello è nascosto.
  const shown = useMemo(() => p.features.filter((f) => visible(f, p.layers) || f.id === selId), [p.features, p.layers, selId]);
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
      <Rectangle bounds={[[s, w], [n, e]]} interactive={false} pathOptions={{ color: '#1F3A5F', weight: 1.5, dashArray: '6 6', fill: false, opacity: 0.6 }} />

      {p.compareRoute && (
        <>
          <Polyline positions={p.compareRoute.coords} interactive={false} pathOptions={{ color: '#ffffff', weight: 8, opacity: 0.85 }} />
          <Polyline positions={p.compareRoute.coords} interactive={false}
            pathOptions={{ color: '#3B4350', weight: 4, dashArray: '1 9', lineCap: 'round' }} />
        </>
      )}
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
          title={`Segnalazione ${STATUS_LABEL[r.status].toLowerCase()}: ${CATEGORY_LABEL[r.category]}`}
          alt={`Segnalazione ${STATUS_LABEL[r.status].toLowerCase()}: ${CATEGORY_LABEL[r.category]}`}
          zIndexOffset={500}
          eventHandlers={clickHandler({ type: 'report', report: r })}
        />
      ))}

      {p.obstacles.map((o, i) => (
        <Marker
          key={`num-${o.type === 'feature' ? o.feature.id : o.report.id}`}
          position={o.type === 'report' ? [o.report.lat, o.report.lng] : o.feature.geometry.type === 'point' ? o.feature.geometry.coords : o.feature.geometry.coords[0]}
          icon={divIcon(`num-${i + 1}`, `<span class="route-num">${i + 1}</span>`, [22, 22], [-6, 30])}
          keyboard={false}
          zIndexOffset={800}
          title={`Ostacolo ${i + 1} lungo il percorso`}
          eventHandlers={clickHandler(o.type === 'feature' ? { type: 'feature', feature: o.feature } : { type: 'report', report: o.report })}
        />
      ))}
      {p.reportPoint && <Marker position={[p.reportPoint.lat, p.reportPoint.lng]} icon={draftIcon} keyboard={false} zIndexOffset={900} title="Posizione della nuova segnalazione" />}
      {p.from && <Marker position={[p.from.lat, p.from.lng]} icon={endpointIcon('A')} keyboard={false} zIndexOffset={1000} title={`Partenza: ${p.from.label}`} />}
      {p.to && <Marker position={[p.to.lat, p.to.lng]} icon={endpointIcon('B')} keyboard={false} zIndexOffset={1000} title={`Destinazione: ${p.to.label}`} />}
      {p.userPos && (
        <CircleMarker center={[p.userPos.lat, p.userPos.lng]} radius={8} interactive={false}
          pathOptions={{ color: '#ffffff', weight: 3, fillColor: '#0B5CAD', fillOpacity: 1 }} />
      )}
    </MapContainer>
  );
}
