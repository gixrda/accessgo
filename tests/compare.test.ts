import { describe, expect, it } from 'vitest';
import type { OsmFeature } from '../shared/types.ts';
import type { RouteAnalysis } from '../src/lib/analysis.ts';
import { formatDistance } from '../src/lib/analysis.ts';
import { compareRoutes, comparisonVerdict } from '../src/lib/compare.ts';

const f = (id: string): OsmFeature => ({ id, source: 'osm', kind: 'steps', certainty: 'known_obstacle', scope: 'path', label: 'Scale', geometry: { type: 'point', coords: [43.7, 10.4] }, tags: {} });
const a = (known: OsmFeature[], possible: OsmFeature[] = []): RouteAnalysis => ({ known, possible, positive: [], unknown: [], reports: [], coverage: 0.5, alongM: {} });

describe('compareRoutes', () => {
  it('trova gli ostacoli evitati e il costo in distanza', () => {
    const c = compareRoutes({ distanceM: 289, analysis: a([]) }, { distanceM: 137, analysis: a([f('steps1')], [f('sett')]) });
    expect(c.avoidedKnown.map((x) => x.id)).toEqual(['steps1']);
    expect(c.avoidedPossible.map((x) => x.id)).toEqual(['sett']);
    expect(c.extraM).toBe(152);
    expect(c.same).toBe(false);
    expect(comparisonVerdict(c, formatDistance)).toBe('Il percorso per sedia a rotelle evita 1 ostacolo noto e 1 possibile criticità che il percorso a piedi attraversa, con 150 m in più.');
  });

  it('riconosce percorsi equivalenti', () => {
    const c = compareRoutes({ distanceM: 1224, analysis: a([f('x')]) }, { distanceM: 1220, analysis: a([f('x')]) });
    expect(c.same).toBe(true);
    expect(comparisonVerdict(c, formatDistance)).toMatch(/coincidono/);
  });

  it('non attribuisce a ostacoli una differenza dovuta solo al profilo', () => {
    const c = compareRoutes({ distanceM: 900, analysis: a([]) }, { distanceM: 700, analysis: a([]) });
    expect(c.same).toBe(false);
    expect(comparisonVerdict(c, formatDistance)).toMatch(/nessun ostacolo noto viene evitato/);
  });

  it('segnala gli ostacoli noti presenti solo sul percorso per sedia a rotelle', () => {
    const kerb = { ...f('kerb'), kind: 'kerb' as const, label: 'Cordolo rialzato' };
    const c = compareRoutes({ distanceM: 290, analysis: a([kerb]) }, { distanceM: 140, analysis: a([f('steps')]) });
    expect(c.addedKnown.map((x) => x.id)).toEqual(['kerb']);
    expect(comparisonVerdict(c, formatDistance)).toMatch(/evita 1 ostacolo noto .* Attenzione: passa da 1 ostacolo noto che il percorso a piedi non ha/);
  });

  it('usa il plurale corretto', () => {
    const c = compareRoutes({ distanceM: 100, analysis: a([]) }, { distanceM: 100, analysis: a([f('1'), f('2')]) });
    expect(comparisonVerdict(c, formatDistance)).toBe('Il percorso per sedia a rotelle evita 2 ostacoli noti che il percorso a piedi attraversa.');
  });
});
