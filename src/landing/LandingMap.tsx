import gsap from 'gsap';
import L from 'leaflet';
import { useEffect, useRef, type Ref, type RefObject } from 'react';
import { MapContainer, Marker, Polyline, TileLayer } from 'react-leaflet';
import { PISA_BOUNDS, type LatLngTuple, type OsmFeature, type Report, type RouteResult } from '../../shared/types.ts';
import type { RouteAlert } from '../lib/alerts.ts';
import { iconSvg, type IconName } from '../lib/icons.ts';
import { LivingLine } from './LivingLine.tsx';
import { CATEGORY_ICON, CATEGORY_LABEL, STATUS_LABEL } from '../lib/labels.ts';

export const PISA_CENTER: LatLngTuple = [43.7175, 10.4005];

// Stessi marker dell'app (src/markers.css): forma, icona e testo, mai solo colore.
const icons = new Map<string, L.DivIcon>();
function divIcon(key: string, html: string, size: [number, number], anchor: [number, number]): L.DivIcon {
  let icon = icons.get(key);
  if (!icon) icons.set(key, icon = L.divIcon({ html, className: 'mk-wrap', iconSize: size, iconAnchor: anchor }));
  return icon;
}
const obstacleIcon = (f: OsmFeature) => divIcon(`known-${f.kind}`, `<span class="mk mk--known">${iconSvg(f.kind, 14)}</span>`, [26, 26], [13, 13]);
function reportIcon(r: Report): L.DivIcon {
  const icon: IconName = r.blocking ? 'block' : CATEGORY_ICON[r.category] as IconName;
  return divIcon(`report-${r.category}-${r.status}-${r.blocking}`,
    `<span class="pin pin--${r.status}${r.blocking ? ' pin--blocking' : ''}">${iconSvg(icon, 16)}<b class="pin__badge">${r.status === 'unverified' ? '?' : '✓'}</b></span>`,
    [34, 42], [17, 40]);
}
const endpointIcon = (letter: 'A' | 'B') => divIcon(`end-${letter}`, `<span class="endpoint endpoint--${letter}">${letter}</span>`, [32, 32], [16, 16]);
// Punti consecutivi a pochi metri (es. i cordoli dello stesso incrocio) condividono un'etichetta "2–3",
// così i numeri restano sul percorso e non si coprono.
const numIcon = (label: string) => divIcon(`num-${label}`, `<span class="route-num${label.length > 2 ? ' route-num--group' : ''}">${label}</span>`, [22, 22], [-6, 30]);
const NEAR_M = 25;
function badgeGroups(alerts: RouteAlert[]): { label: string; title: string; anchor: LatLngTuple; key: string }[] {
  const groups: { first: number; last: number; items: RouteAlert[] }[] = [];
  alerts.forEach((a, i) => {
    const g = groups[groups.length - 1];
    if (g && a.alongM - g.items[g.items.length - 1].alongM <= NEAR_M) { g.items.push(a); g.last = i + 1; }
    else groups.push({ first: i + 1, last: i + 1, items: [a] });
  });
  return groups.map((g) => ({
    label: g.first === g.last ? String(g.first) : `${g.first}–${g.last}`,
    title: g.items.map((a, k) => `${g.first + k}. ${a.title}`).join(' · '),
    anchor: g.items[0].anchor,
    key: g.items.map((a) => a.key).join('+'),
  }));
}
const destIcon = divIcon('dest', `<span class="ow-dest">${iconSvg('pin', 18)}</span>`, [36, 36], [18, 34]);

const reducedMotion = () => window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/** Disegna il percorso dalla partenza all'arrivo la prima volta che compare: mostra il verso di percorrenza. */
function useRouteDraw(line: RefObject<L.Polyline | null>, route: RouteResult | null) {
  useEffect(() => {
    const path = line.current?.getElement() as SVGPathElement | undefined;
    if (!path || !route || reducedMotion()) return;
    const len = path.getTotalLength();
    const tween = gsap.fromTo(path, { strokeDasharray: len, strokeDashoffset: len }, {
      strokeDashoffset: 0, duration: 1.6, ease: 'power2.inOut', delay: 0.3,
      onComplete: () => gsap.set(path, { clearProps: 'strokeDasharray,strokeDashoffset' }), // lo zoom ridisegna il tracciato
    });
    return () => { tween.kill(); gsap.set(path, { clearProps: 'strokeDasharray,strokeDashoffset' }); };
  }, [line, route]);
}

interface Props {
  mapRef?: Ref<L.Map>;
  label: string;
  className?: string;
  features: OsmFeature[];
  reports: Report[];
  route: RouteResult | null;
  alerts: RouteAlert[];
  destination?: { lat: number; lng: number; label: string } | null;
  zoom?: number;
  /** Percorso animato (The Living Line) al posto del tracciato fermo */
  living?: { branches: LatLngTuple[][]; playing: boolean; at?: number };
}

export function LandingMap({ mapRef, label, className, features, reports, route, alerts, destination, zoom = 16, living }: Props) {
  const line = useRef<L.Polyline>(null);
  useRouteDraw(line, route);
  const [ps, pw, pn, pe] = PISA_BOUNDS;
  const known = features.filter((f) => f.certainty === 'known_obstacle' && f.scope === 'path');
  const ends = route?.coords.length ? [route.coords[0], route.coords[route.coords.length - 1]] : null;

  return (
    <MapContainer
      ref={mapRef}
      center={PISA_CENTER}
      zoom={zoom}
      minZoom={13}
      maxZoom={19}
      maxBounds={[[ps, pw], [pn, pe]]}
      zoomControl={false}
      scrollWheelZoom={false}
      className={`ow-map${className ? ` ${className}` : ''}`}
      aria-label={label}
    >
      <TileLayer
        className="ow-tiles"
        url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        maxZoom={19}
        attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
      />
      {known.map((f) => f.geometry.type === 'line' ? (
        <Polyline key={f.id} positions={f.geometry.coords} interactive={false} pathOptions={{ color: '#B54800', weight: 5, opacity: 0.9 }} />
      ) : (
        <Marker key={f.id} position={f.geometry.coords} icon={obstacleIcon(f)} keyboard={false} title={`Ostacolo noto: ${f.label}`} />
      ))}
      {reports.filter((r) => r.status !== 'resolved').map((r) => (
        <Marker key={r.id} position={[r.lat, r.lng]} icon={reportIcon(r)} keyboard={false} zIndexOffset={500}
          title={`${CATEGORY_LABEL[r.category]}${r.blocking ? ', non si passa' : ''} (${STATUS_LABEL[r.status].toLowerCase()})`} />
      ))}
      {route && (
        <>
          {route.safety?.segments.map((s, i) => (
            <Polyline key={`seg-${i}`} positions={s.coords} interactive={false}
              pathOptions={{ color: '#E8A317', weight: 16, opacity: 0.85, dashArray: '8 6', lineCap: 'butt' }} />
          ))}
          {living ? (
            <LivingLine coords={route.coords} branches={living.branches} playing={living.playing} at={living.at} dashed={route.mode !== 'wheelchair'} />
          ) : (
            <>
              <Polyline positions={route.coords} interactive={false} pathOptions={{ color: '#FFFFFF', weight: 11, opacity: 0.95 }} />
              <Polyline ref={line} positions={route.coords} interactive={false}
                pathOptions={route.mode === 'wheelchair' ? { color: '#1677FF', weight: 6 } : { color: '#1677FF', weight: 6, dashArray: '10 8' }} />
            </>
          )}
        </>
      )}
      {badgeGroups(alerts).map((g) => (
        <Marker key={`num-${g.key}`} position={g.anchor} icon={numIcon(g.label)} keyboard={false} zIndexOffset={800} title={g.title} />
      ))}
      {ends && !living && (
        <>
          <Marker position={ends[0]} icon={endpointIcon('A')} keyboard={false} zIndexOffset={1000} title="Partenza" />
          <Marker position={ends[1]} icon={endpointIcon('B')} keyboard={false} zIndexOffset={1000} title="Arrivo" />
        </>
      )}
      {destination && (
        <Marker position={[destination.lat, destination.lng]} icon={destIcon} keyboard={false} zIndexOffset={1200} title={destination.label} />
      )}
    </MapContainer>
  );
}
