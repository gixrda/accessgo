import { describe, expect, it } from 'vitest';
import { RULES, routingImpact } from '../shared/rules.ts';
import type { LatLngTuple, Report } from '../shared/types.ts';
import { avoids, obstaclePoint, rerouteDecision } from '../src/lib/reroute.ts';

// Percorso rettilineo est-ovest di ~400 m. 1e-5 gradi di latitudine ≈ 1,1 m.
const LAT = 43.716;
const route: LatLngTuple[] = [[LAT, 10.4], [LAT, 10.405]];
const north = (m: number) => LAT + m / 110_540;

function report(over: Partial<Report>): Report {
  return {
    id: 'r', lat: LAT, lng: 10.402, description: '', category: 'obstructed_sidewalk', categorySource: 'interpretation',
    createdAt: '', status: 'unverified', source: 'user_report', hasPhoto: false,
    interpretation: { category: 'obstructed_sidewalk', obstacle: null, summary: '', severity: 'unknown', missing_info: [], question: null, photo_note: null, blocking: true, engine: 'fallback' },
    blocking: true, blockingSource: 'user', snap: { lat: LAT, lng: 10.402, distanceM: 1 }, impact: 'avoid',
    ...over,
  };
}

describe('regole di routing per categoria', () => {
  it.each([
    ['obstructed_sidewalk', true, 2, 'avoid'],
    ['steps', null, 2, 'avoid'], // le scale si evitano anche senza la parola "bloccante"
    ['steps', false, 2, 'caution'], // chi segnala dice che si passa: ha l'ultima parola
    ['uneven_surface', null, 2, 'caution'],
    ['kerb', null, 2, 'caution'],
    ['obstructed_sidewalk', true, 30, 'unlocated'],
    ['obstructed_sidewalk', true, null, 'avoid'], // servizio di aggancio non disponibile: si usa il punto scelto
  ] as const)('%s, bloccante=%s, a %s m dalla rete → %s', (category, blocking, dist, impact) => {
    expect(routingImpact(category, blocking, dist)).toBe(impact);
  });
});

describe('scenari di ricalcolo', () => {
  it('1. ostacolo esattamente sul percorso: si cerca un\'alternativa', () => {
    expect(rerouteDecision(report({}), route)).toBe('reroute');
  });

  it('2. ostacolo vicino ma su un\'altra via: nessuna deviazione', () => {
    // toccato a 6 m dal percorso, ma la rete lo aggancia alla via parallela a 12 m
    const r = report({ lat: north(6), snap: { lat: north(12), lng: 10.402, distanceM: 6 } });
    expect(12).toBeGreaterThan(RULES.ON_EDGE_M);
    expect(rerouteDecision(r, route)).toBe('not-on-route');
  });

  it('2b. marciapiede bloccato e percorso sulla carreggiata accanto (6 m): non è "sul percorso"', () => {
    const r = report({ snap: { lat: north(6), lng: 10.402, distanceM: 1 }, lat: north(6) });
    expect(rerouteDecision(r, route)).toBe('not-on-route');
    expect(avoids(route, r)).toBe(true);
  });

  it('3. il nuovo percorso deve evitare il segmento: verifica sulla geometria', () => {
    const r = report({});
    const detour: LatLngTuple[] = [[LAT, 10.4], [north(40), 10.401], [north(40), 10.403], [LAT, 10.405]];
    expect(avoids(detour, r)).toBe(true);
    expect(avoids(route, r)).toBe(false);
  });

  it('4. ostacolo irrilevante per la sedia a rotelle: nessun ricalcolo', () => {
    expect(rerouteDecision(report({ impact: 'caution', blocking: null, category: 'uneven_surface' }), route)).toBe('caution');
    expect(rerouteDecision(report({ status: 'resolved' }), route)).toBe('caution');
  });

  it('5. ostacolo non localizzato con sufficiente precisione: non entra nel calcolo', () => {
    expect(rerouteDecision(report({ impact: 'unlocated', snap: null }), route)).toBe('unlocated');
  });

  it('un ostacolo non localizzato resta dove è stato toccato, non sul punto agganciato lontano', () => {
    // toccato dentro un isolato a 40 m; la via più vicina (agganciata a 20 m) è proprio il percorso
    const r = report({ impact: 'unlocated', lat: north(40), snap: { lat: LAT, lng: 10.402, distanceM: 20.6 } });
    expect(obstaclePoint(r)).toEqual([north(40), 10.402]);
  });

  it('usa il punto scelto sulla mappa se l\'aggancio alla rete non è disponibile', () => {
    expect(rerouteDecision(report({ snap: null, lat: north(4) }), route)).toBe('reroute');
    expect(rerouteDecision(report({ snap: null, lat: north(20) }), route)).toBe('not-on-route');
  });
});
