import type { RouteResult } from '../../shared/types.ts';
import type { RouteAlert } from './alerts.ts';

const NOT_VERIFIABLE = 'Non è stato possibile trovare un percorso sufficientemente verificabile. Controlla la mappa prima di proseguire.';

/** Esito in una frase: cosa deve sapere chi parte. Non dice mai "sicuro" o "accessibile". */
export function verdictOf(route: RouteResult, alerts: RouteAlert[]): { tone: 'warn' | 'calm'; title: string; text: string } {
  if (route.mode === 'foot_fallback') {
    return { tone: 'warn', title: 'Solo percorso a piedi', text: `${route.notice ?? ''} Attenzione: non è pensato per la sedia a rotelle e può avere scale o gradini.`.trim() };
  }
  const unverifiable = !route.safety?.checked || !route.safety.verifiable;
  if (alerts.length) {
    return {
      tone: 'warn',
      title: alerts.length === 1 ? '1 punto di attenzione' : `${alerts.length} punti di attenzione`,
      text: unverifiable ? NOT_VERIFIABLE : 'Li trovi qui sotto e numerati sulla mappa.',
    };
  }
  if (unverifiable) return { tone: 'warn', title: 'Nessun ostacolo noto', text: NOT_VERIFIABLE };
  return { tone: 'calm', title: 'Nessun ostacolo noto', text: 'Secondo i dati della mappa passa solo su marciapiedi e zone pedonali.' };
}
