import type { ReportCategory } from './types.ts';

/**
 * Regole che collegano una segnalazione al calcolo del percorso (profilo sedia a rotelle).
 * Valori in metri, configurabili qui in un solo punto.
 */
export const RULES = {
  /** Oltre questa distanza dalla via più vicina l'ostacolo non è localizzato con sufficiente precisione */
  SNAP_MAX_M: 15,
  /**
   * Un ostacolo agganciato alla rete sta su una via precisa: è "sul percorso" se il percorso passa entro questa distanza.
   * Stessa soglia per decidere il ricalcolo, per verificare il nuovo percorso e per l'elenco: marciapiede e carreggiata
   * paralleli distano di solito 4-10 m, quindi un ostacolo sul marciapiede non fa deviare chi passa sulla via accanto.
   */
  ON_EDGE_M: 3,
  /** Senza aggancio (servizio non disponibile) si tollera l'imprecisione del tocco sulla mappa */
  RAW_NEAR_M: 15,
  /** Semilato dell'area esclusa attorno al punto agganciato alla rete (piccola: non tocca le vie parallele) */
  AVOID_HALF_M: 5,
} as const;

/** Categorie incompatibili con la sedia a rotelle anche senza la parola "bloccante" nel testo. */
const ALWAYS_AVOID: ReportCategory[] = ['steps'];

export type RoutingImpact = 'avoid' | 'caution' | 'unlocated';

/**
 * - avoid: il percorso deve evitarlo (bloccante per chi segnala o per l'analisi, oppure scale);
 * - caution: solo mostrato sulla mappa e nell'elenco, nessuna deviazione;
 * - unlocated: dovrebbe essere evitato, ma il punto è lontano da ogni via: non lo usiamo per il calcolo.
 * Chi segnala ha l'ultima parola: "Sì, con difficoltà" (blocking=false) non fa mai deviare.
 */
export function routingImpact(category: ReportCategory, blocking: boolean | null, snapDistanceM: number | null): RoutingImpact {
  if (blocking === false) return 'caution';
  if (blocking !== true && !ALWAYS_AVOID.includes(category)) return 'caution';
  if (snapDistanceM !== null && snapDistanceM > RULES.SNAP_MAX_M) return 'unlocated';
  return 'avoid';
}
