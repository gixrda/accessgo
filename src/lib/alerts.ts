import type { LatLngTuple, OsmFeature, RouteResult } from '../../shared/types.ts';
import type { Selection } from '../components/MapView.tsx';
import { distanceAlong, formatDistance, routeObstacles, type RouteAnalysis } from './analysis.ts';
import type { IconName } from './icons.ts';
import { CATEGORY_ICON, CATEGORY_LABEL } from './labels.ts';

/** Un punto a cui fare attenzione lungo il percorso: ostacolo noto, segnalazione o tratto senza marciapiede. */
export interface RouteAlert {
  key: string;
  kind: 'obstacle' | 'report' | 'road';
  icon: IconName;
  title: string;
  detail: string;
  alongM: number;
  /** Dove mostrare il numero sulla mappa */
  anchor: LatLngTuple;
  focus: LatLngTuple[];
  selection?: NonNullable<Selection>;
}

// Spiegazione in parole semplici, per chi non conosce i termini tecnici.
export const PLAIN: Partial<Record<OsmFeature['kind'], string>> = {
  kerb: 'Gradino tra marciapiede e strada',
  steps: 'Nessuna rampa indicata',
  barrier: 'Può restringere o bloccare il passaggio',
  width: 'La sedia a rotelle potrebbe non passare',
  smoothness: 'Le ruote possono bloccarsi o sobbalzare',
  surface: 'Le ruote possono bloccarsi o sobbalzare',
  incline: 'Può servire aiuto per salire o scendere',
};

const coordsOf = (f: OsmFeature): LatLngTuple[] => f.geometry.type === 'point' ? [f.geometry.coords] : f.geometry.coords;

/** Tutti i punti di attenzione, nell'ordine in cui si incontrano: numerati allo stesso modo nel pannello e sulla mappa. */
export function routeAlerts(route: RouteResult, analysis: RouteAnalysis): RouteAlert[] {
  const alerts: RouteAlert[] = routeObstacles(analysis).map((o): RouteAlert => {
    if (o.type === 'report') {
      const r = o.report;
      return {
        key: r.id, kind: 'report', icon: r.blocking ? 'block' : CATEGORY_ICON[r.category] as IconName,
        title: r.blocking ? `${CATEGORY_LABEL[r.category]}: non si passa` : CATEGORY_LABEL[r.category],
        detail: r.status === 'unverified' ? 'Segnalato da un utente, da controllare sul posto' : 'Segnalato da un utente e controllato sul posto',
        alongM: o.alongM, anchor: [r.lat, r.lng], focus: [[r.lat, r.lng]], selection: { type: 'report', report: r },
      };
    }
    const f = o.feature;
    const coords = coordsOf(f);
    return {
      key: f.id, kind: 'obstacle', icon: f.kind,
      title: f.label, detail: [PLAIN[f.kind], f.name].filter(Boolean).join(' · '),
      alongM: o.alongM, anchor: coords[0], focus: coords, selection: { type: 'feature', feature: f },
    };
  });
  for (const [i, s] of (route.safety?.segments ?? []).entries()) {
    if (!s.coords.length) continue;
    alerts.push({
      key: `segment-${i}`, kind: 'road', icon: s.kind === 'steps' ? 'steps' : 'road',
      title: s.kind === 'main_road' ? 'Strada trafficata senza marciapiede' : s.kind === 'steps' ? 'Scale' : 'Strada senza marciapiede',
      detail: `${s.name ?? 'Via senza nome'} · ${formatDistance(s.lengthM)} da percorrere in strada`,
      alongM: distanceAlong(route.coords, s.coords[0]), anchor: s.coords[Math.floor(s.coords.length / 2)], focus: s.coords,
    });
  }
  return alerts.sort((a, b) => a.alongM - b.alongM);
}
