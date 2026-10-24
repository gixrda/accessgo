import { describe, expect, it } from 'vitest';
import type { LatLngTuple, OsmFeature, Report } from '../shared/types.ts';
import { analyzeRoute, formatDistance, formatDuration, routeObstacles } from '../src/lib/analysis.ts';

// Percorso rettilineo est-ovest di ~400 m a Pisa. 1e-5 gradi di latitudine ≈ 1,1 m.
const LAT = 43.716;
const route: LatLngTuple[] = [[LAT, 10.400], [LAT, 10.405]];

function point(id: string, lat: number, lng: number, certainty: OsmFeature['certainty'], scope: OsmFeature['scope'] = 'path'): OsmFeature {
  return { id, source: 'osm', kind: 'kerb', certainty, scope, label: id, geometry: { type: 'point', coords: [lat, lng] }, tags: {} };
}
function line(id: string, coords: LatLngTuple[], certainty: OsmFeature['certainty']): OsmFeature {
  return { id, source: 'osm', kind: 'surface', certainty, scope: 'path', label: id, geometry: { type: 'line', coords }, tags: {} };
}
function report(id: string, lat: number, lng: number, status: Report['status'] = 'unverified'): Report {
  return {
    id, lat, lng, description: 'gradino alto', category: 'steps', categorySource: 'interpretation', createdAt: '', status, source: 'user_report',
    interpretation: { category: 'steps', obstacle: null, summary: '', severity: 'unknown', missing_info: [], question: null, photo_note: null, engine: 'fallback' },
    hasPhoto: false,
  };
}

describe('analyzeRoute', () => {
  it('rileva i nodi sul percorso e ignora quelli lontani', () => {
    const a = analyzeRoute(route, [
      point('on', LAT + 0.00002, 10.402, 'known_obstacle'),
      point('far', LAT + 0.0003, 10.402, 'known_obstacle'),
      point('fav', LAT, 10.403, 'positive_info'),
      point('crossing', LAT, 10.404, 'info'),
    ], []);
    expect(a.known.map((f) => f.id)).toEqual(['on']);
    expect(a.positive.map((f) => f.id)).toEqual(['fav']);
    expect(a.unknown.map((f) => f.id)).toEqual(['crossing']);
  });

  it("non conta l'accessibilità dei luoghi come ostacolo sul percorso", () => {
    expect(analyzeRoute(route, [point('shop', LAT, 10.402, 'known_obstacle', 'place')], []).known).toEqual([]);
  });

  it('conta una via percorsa ma non una che si limita a incrociare il percorso', () => {
    const along = line('along', [[LAT, 10.401], [LAT, 10.403]], 'possible_issue');
    const across = line('across', [[LAT - 0.001, 10.402], [LAT + 0.001, 10.402]], 'possible_issue');
    const a = analyzeRoute(route, [along, across], []);
    expect(a.possible.map((f) => f.id)).toEqual(['along']);
    expect(a.coverage).toBeGreaterThan(0.35);
    expect(a.coverage).toBeLessThan(0.5);
  });

  it('senza dati la copertura è zero e non ci sono ostacoli: nessuna conclusione positiva', () => {
    const a = analyzeRoute(route, [], []);
    expect(a.coverage).toBe(0);
    expect(a.known).toEqual([]);
  });

  it('include le segnalazioni vicine non risolte', () => {
    const a = analyzeRoute(route, [], [report('near', LAT + 0.0001, 10.402), report('done', LAT, 10.403, 'resolved'), report('far', LAT + 0.001, 10.402)]);
    expect(a.reports.map((r) => r.id)).toEqual(['near']);
  });

  it('ordina ostacoli e segnalazioni per distanza dalla partenza', () => {
    const a = analyzeRoute(route, [
      point('lontano', LAT, 10.404, 'known_obstacle'),
      point('vicino', LAT, 10.4005, 'known_obstacle'),
      line('scale', [[LAT, 10.402], [LAT, 10.4025]], 'known_obstacle'),
    ], [report('segnalazione', LAT + 0.00005, 10.403)]);
    const order = routeObstacles(a);
    expect(order.map((o) => o.type === 'feature' ? o.feature.id : o.report.id)).toEqual(['vicino', 'scale', 'segnalazione', 'lontano']);
    // 0,0005° di longitudine a questa latitudine ≈ 40 m
    expect(order[0].alongM).toBeGreaterThan(35);
    expect(order[0].alongM).toBeLessThan(45);
  });

  it('gestisce un percorso degenere', () => {
    expect(analyzeRoute([[LAT, 10.4]], [point('x', LAT, 10.4, 'known_obstacle')], []).known).toEqual([]);
  });
});

describe('formattazione', () => {
  it('formatta distanze e durate in italiano', () => {
    expect(formatDistance(234)).toBe('230 m');
    expect(formatDistance(1234)).toBe('1,2 km');
    expect(formatDuration(30)).toBe('1 min');
    expect(formatDuration(4000)).toBe('1 h 7 min');
  });
});
