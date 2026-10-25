import { describe, expect, it } from 'vitest';
import type { LatLngTuple, OsmFeature } from '../shared/types.ts';
import { bestFork, branchesFrom, cumulative, pointAt } from '../src/landing/livingLine.ts';

// Percorso dritto verso nord di ~220 m a Pisa (via Roma) e strade sintetiche attorno a metà.
const route: LatLngTuple[] = [[43.71696, 10.39513], [43.71856, 10.39513]];
const mid: LatLngTuple = [43.71776, 10.39513];
const way = (id: string, coords: LatLngTuple[]): OsmFeature => ({
  id, source: 'osm', kind: 'surface', certainty: 'info', scope: 'path', label: id, geometry: { type: 'line', coords }, tags: {},
});

describe('Living Line', () => {
  it('interpola sul percorso, non in linea retta tra gli estremi', () => {
    const bent: LatLngTuple[] = [[43.716, 10.395], [43.717, 10.395], [43.717, 10.397]];
    const p = pointAt(bent, cumulative(bent), 0.25);
    expect(p[1]).toBeCloseTo(10.395, 6); // ancora sul primo tratto, verso nord
    expect(p[0]).toBeGreaterThan(43.716);
  });

  it('prende solo strade che partono dal punto e si allontanano dal percorso, in direzioni diverse', () => {
    const east = way('east', [mid, [43.71776, 10.3965]]);
    const west = way('west', [[43.71776, 10.3938], mid]);
    const eastAgain = way('east2', [mid, [43.71779, 10.3964]]); // stessa direzione di "east"
    const parallel = way('parallel', [[43.7172, 10.39516], [43.7183, 10.39516]]); // corre lungo il percorso
    const far = way('far', [[43.7150, 10.40], [43.7151, 10.401]]);
    const branches = branchesFrom(route, [east, west, eastAgain, parallel, far]);
    expect(branches).toHaveLength(2);
    for (const b of branches) {
      expect(b[0][1]).toBeCloseTo(10.39513, 5); // parte da un punto del percorso
      expect(Math.abs(b[b.length - 1][1] - 10.39513)).toBeGreaterThan(0.0002); // e se ne allontana
    }
  });

  it('sceglie il punto del percorso con più strade che partono', () => {
    const p60: LatLngTuple = [43.71792, 10.39513];
    const fork = bestFork(route, [way('e', [p60, [43.71792, 10.3966]]), way('w', [[43.71792, 10.3937], p60])]);
    expect(fork.branches).toHaveLength(2);
    expect(fork.at).toBeGreaterThanOrEqual(0.45); // il bivio sta dove partono le strade, non all'inizio
  });

  it('nessuna strada adatta: nessuna diramazione', () => {
    expect(branchesFrom(route, [])).toEqual([]);
  });
});
