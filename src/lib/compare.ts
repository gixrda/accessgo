import type { OsmFeature } from '../../shared/types.ts';
import type { RouteAnalysis } from './analysis.ts';

export interface RouteComparison {
  /** Ostacoli noti sul percorso a piedi che il percorso per sedia a rotelle non attraversa */
  avoidedKnown: OsmFeature[];
  avoidedPossible: OsmFeature[];
  /** Ostacoli noti sul percorso per sedia a rotelle che il percorso a piedi non attraversa (es. cordoli ignoti al router) */
  addedKnown: OsmFeature[];
  /** Metri in più (positivo) o in meno del percorso per sedia a rotelle rispetto a quello a piedi */
  extraM: number;
  /** I due percorsi sono praticamente uguali */
  same: boolean;
}

export function compareRoutes(
  wheel: { distanceM: number; analysis: RouteAnalysis },
  foot: { distanceM: number; analysis: RouteAnalysis },
): RouteComparison {
  const notIn = (list: OsmFeature[], other: OsmFeature[]) => {
    const ids = new Set(other.map((f) => f.id));
    return list.filter((f) => !ids.has(f.id));
  };
  const avoidedKnown = notIn(foot.analysis.known, wheel.analysis.known);
  const avoidedPossible = notIn(foot.analysis.possible, wheel.analysis.possible);
  const addedKnown = notIn(wheel.analysis.known, foot.analysis.known);
  const extraM = wheel.distanceM - foot.distanceM;
  const sameObstacles = !avoidedKnown.length && !avoidedPossible.length
    && !addedKnown.length && !notIn(wheel.analysis.possible, foot.analysis.possible).length;
  return {
    avoidedKnown, avoidedPossible, addedKnown, extraM,
    same: sameObstacles && Math.abs(extraM) <= Math.max(20, foot.distanceM * 0.03),
  };
}
