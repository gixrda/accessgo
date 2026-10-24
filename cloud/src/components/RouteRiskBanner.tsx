import type { RouteResult } from '../../shared/types.ts';
import type { RouteAnalysis } from '../lib/analysis.ts';

/** Routing checks only describe the available data; they never certify real-world access. */
export function RouteRiskBanner({ route, analysis }: { route: RouteResult; analysis: RouteAnalysis | null }) {
  const safety = route.safety;
  const blocked = safety?.status === 'blocked';
  const unavailable = safety?.status === 'unavailable';
  const rerouted = safety?.status === 'rerouted';
  const avoided = safety?.avoided.length ?? 0;
  const title = blocked ? 'Deviazione non disponibile'
    : unavailable ? 'Controllo degli ostacoli non disponibile'
      : rerouted ? `${avoided} ${avoided === 1 ? 'ostacolo evitato' : 'ostacoli evitati'}` : 'Percorso da verificare';
  const pct = analysis ? Math.round(analysis.coverage * 100) : null;
  const lowCoverage = pct === null || pct < 50;
  return <section className={`route-risk route-risk--compact route-risk--${blocked ? 'blocked' : unavailable ? 'warning' : 'info'}`}
    aria-labelledby="route-risk-title" role={blocked || unavailable ? 'alert' : 'region'}>
    <h3 id="route-risk-title">{title}</h3>
    {(blocked || unavailable) ? <p className="route-risk__stop"><strong>Solo consultazione: non partire seguendo questo percorso. Guida vocale disattivata.</strong>
      {!!safety?.blockedBy.length && <> {safety.blockedBy.length} {safety.blockedBy.length === 1 ? 'ostacolo sul tragitto' : 'ostacoli sul tragitto'}.</>}
    </p> : analysis && <p className="route-risk__brief">
      {analysis.known.length > 0 && <><strong>{analysis.known.length} ostacoli noti</strong> · </>}
      {analysis.possible.length} possibili criticità · {analysis.unknown.length} attraversamenti senza dati.
    </p>}
    <p className="route-risk__note">Non verificato sul posto.{lowCoverage && ' Dati incompleti: accessibilità sconosciuta sui tratti senza informazioni.'}
      {safety && !safety.reportsChecked && ' Segnalazioni aggiornate non controllate.'}
    </p>
    <details className="route-risk__details">
      <summary>Dettagli dei rischi</summary>
      {safety?.message && <p>{safety.message}</p>}
      {(blocked || unavailable) && <p>Cambia le tappe o verifica un’alternativa sul posto.</p>}
      {safety?.blockedBy.length ? <ul>{safety.blockedBy.map((obstacle) => <li key={`${obstacle.source}:${obstacle.id}`}>
        <strong>{obstacle.label}</strong> · {obstacle.source === 'verified_report' ? 'segnalazione confermata' : 'dato OpenStreetMap'}
      </li>)}</ul> : null}
      {rerouted && <p><strong>{avoided} {avoided === 1 ? 'ostacolo escluso' : 'ostacoli esclusi'} dal percorso ricalcolato.</strong> La deviazione è stata ricontrollata sui dati disponibili.</p>}
      {analysis && <dl className="route-risk__counts">
        <div><dt>Ostacoli noti</dt><dd>{analysis.known.length}</dd></div>
        <div><dt>Possibili criticità</dt><dd>{analysis.possible.length}</dd></div>
        <div><dt>Attraversamenti senza dati</dt><dd>{analysis.unknown.length}</dd></div>
        <div><dt>Segnalazioni lungo il percorso</dt><dd>{analysis.reports.length}</dd></div>
      </dl>}
      {pct !== null && <p className="route-risk__coverage">Copertura delle informazioni OSM: <strong>{pct}%</strong>. Non è un punteggio di sicurezza.</p>}
      {lowCoverage && <p className="route-risk__warning"><strong>Informazioni insufficienti per valutare tutto il tragitto.</strong> I tratti senza dati restano di accessibilità sconosciuta.</p>}
      {safety && !safety.reportsChecked && <p className="route-risk__warning">Le segnalazioni aggiornate non sono state controllate.</p>}
      <p>L’assenza di ostacoli nei dati non garantisce la percorribilità; le possibili criticità richiedono attenzione.</p>
    </details>
  </section>;
}
