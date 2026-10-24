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

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** Frase di sintesi del confronto, senza dichiarare accessibile ciò che i dati non dicono. */
export function comparisonVerdict(c: RouteComparison, formatDistance: (m: number) => string): string {
  if (c.same) return 'I due percorsi coincidono: nei dati disponibili non ci sono differenze di ostacoli tra i due profili.';
  const parts: string[] = [];
  if (c.avoidedKnown.length) parts.push(plural(c.avoidedKnown.length, 'ostacolo noto', 'ostacoli noti'));
  if (c.avoidedPossible.length) parts.push(plural(c.avoidedPossible.length, 'possibile criticità', 'possibili criticità'));
  const cost = c.extraM > 20 ? `, con ${formatDistance(c.extraM)} in più` : '';
  const head = parts.length
    ? `Il percorso per sedia a rotelle evita ${parts.join(' e ')} che il percorso a piedi attraversa${cost}.`
    : `I percorsi sono diversi${cost}, ma nei dati disponibili nessun ostacolo noto viene evitato: la differenza dipende dalle preferenze del profilo (fondi, scale, velocità).`;
  if (!c.addedKnown.length) return head;
  return `${head} Attenzione: passa da ${plural(c.addedKnown.length, 'ostacolo noto', 'ostacoli noti')} che il percorso a piedi non ha (il router non li conosce tutti, es. i cordoli).`;
}
