import type { RouteResult } from '../../shared/types.ts';
import type { RouteAnalysis } from '../lib/analysis.ts';

/** Routing checks only describe the available data; they never certify real-world access. */
export function RouteRiskBanner({ route, analysis }: { route: RouteResult; analysis: RouteAnalysis | null }) {
  const safety = route.safety;
  const blocked = safety?.status === 'blocked';
  const unavailable = safety?.status === 'unavailable';
  const rerouted = safety?.status === 'rerouted';
  const title = blocked ? 'Deviazione non disponibile'
    : unavailable ? 'Controllo degli ostacoli non disponibile'
      : rerouted ? 'Percorso ricalcolato per evitare ostacoli'
        : safety ? 'Controllo completato sui dati disponibili' : 'Controlla i rischi prima di partire';
  const pct = analysis ? Math.round(analysis.coverage * 100) : null;
  return <section className={`route-risk route-risk--${blocked ? 'blocked' : unavailable ? 'warning' : 'info'}`}
    aria-labelledby="route-risk-title" role={blocked || unavailable ? 'alert' : 'region'}>
    <span className="route-risk__eyebrow">Rischi del percorso</span>
    <h3 id="route-risk-title">{title}</h3>
    {safety?.message && <p>{safety.message}</p>}
    {(blocked || unavailable) && <p className="route-risk__stop"><strong>Percorso solo da consultare, non consigliato per partire. Guida vocale disattivata.</strong> Cambia le tappe o verifica un’alternativa sul posto.</p>}
    {safety?.blockedBy.length ? <ul>{safety.blockedBy.map((obstacle) => <li key={`${obstacle.source}:${obstacle.id}`}>
      <strong>{obstacle.label}</strong> · {obstacle.source === 'verified_report' ? 'segnalazione confermata' : 'dato OpenStreetMap'}
    </li>)}</ul> : null}
    {rerouted && <p><strong>{safety.avoided.length} {safety.avoided.length === 1 ? 'ostacolo escluso' : 'ostacoli esclusi'} dal percorso ricalcolato.</strong> La deviazione è stata ricontrollata sui dati disponibili.</p>}
    {analysis && <dl className="route-risk__counts">
      <div><dt>Ostacoli noti</dt><dd>{analysis.known.length}</dd></div>
      <div><dt>Possibili criticità</dt><dd>{analysis.possible.length}</dd></div>
      <div><dt>Attraversamenti senza dati</dt><dd>{analysis.unknown.length}</dd></div>
      <div><dt>Segnalazioni lungo il percorso</dt><dd>{analysis.reports.length}</dd></div>
    </dl>}
    {pct !== null && <p className="route-risk__coverage">Copertura delle informazioni OSM: <strong>{pct}%</strong>. Non è un punteggio di sicurezza.</p>}
    {(pct === null || pct < 50) && <p className="route-risk__warning"><strong>Informazioni insufficienti per valutare tutto il tragitto.</strong> I tratti senza dati restano di accessibilità sconosciuta.</p>}
    {safety && !safety.reportsChecked && <p className="route-risk__warning">Le segnalazioni aggiornate non sono state controllate.</p>}
    <p className="route-risk__note">Non verificato sul posto. L’assenza di ostacoli nei dati non garantisce la percorribilità; le possibili criticità richiedono attenzione.</p>
  </section>;
}
