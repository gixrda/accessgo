import { distanceToRoute } from '../../shared/geo.ts';
import { RULES } from '../../shared/rules.ts';
import type { LatLngTuple, Report } from '../../shared/types.ts';

/** Stato del ricalcolo dopo una nuova segnalazione, mostrato nel pannello del percorso e nella conferma. */
export type Recalc =
  | { kind: 'running' }
  | { kind: 'updated' }
  | { kind: 'no-alternative' }
  | { kind: 'error'; message: string }
  | { kind: 'not-on-route' }
  | { kind: 'unlocated' }
  | { kind: 'caution' };

/** L'aggancio alla rete è affidabile solo entro la soglia: oltre, il punto agganciato potrebbe essere su un'altra via. */
export const snapUsable = (r: Report) => r.snap !== null && r.snap.distanceM <= RULES.SNAP_MAX_M;

/** Punto dell'ostacolo usato per i calcoli: quello agganciato alla rete se affidabile, altrimenti quello scelto sulla mappa. */
export const obstaclePoint = (r: Report): LatLngTuple => (snapUsable(r) ? [r.snap!.lat, r.snap!.lng] : [r.lat, r.lng]);

/**
 * Serve ricalcolare il percorso attivo? Solo se l'ostacolo va evitato (regole in shared/rules.ts)
 * e il suo punto sulla rete è davvero sul percorso: un ostacolo su una via vicina non fa deviare.
 */
export function rerouteDecision(r: Report, route: LatLngTuple[]): 'reroute' | 'not-on-route' | 'unlocated' | 'caution' {
  if (r.status === 'resolved' || r.impact === 'caution') return 'caution';
  if (r.impact === 'unlocated') return 'unlocated';
  return onRoute(route, r) ? 'reroute' : 'not-on-route';
}

/** Soglia unica: la stessa per elenco, decisione di ricalcolo e verifica. */
export const nearM = (r: Report) => (snapUsable(r) ? RULES.ON_EDGE_M : RULES.RAW_NEAR_M);
export const onRoute = (route: LatLngTuple[], r: Report) => distanceToRoute(route, obstaclePoint(r)) <= nearM(r);

/** Il nuovo percorso evita davvero l'ostacolo? Si controlla la geometria, non si dà per scontato. */
export const avoids = (route: LatLngTuple[], r: Report) => !onRoute(route, r);
