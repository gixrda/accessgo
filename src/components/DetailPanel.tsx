import { useState, type ReactNode } from 'react';
import {
  VERIFICATION_STATUSES, type Interpretation as InterpretationData, type OsmFeature, type Report, type ServerStatus, type VerificationStatus,
} from '../../shared/types.ts';
import { api } from '../api.ts';
import { PLAIN } from '../lib/alerts.ts';
import { CATEGORY_LABEL, CERTAINTY_HINT, CERTAINTY_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import { Icon } from './Icon.tsx';
import type { Selection } from './MapView.tsx';

const CERTAINTY_CLASS = { known_obstacle: 'known', possible_issue: 'possible', positive_info: 'positive', info: 'info' } as const;
const TAG_LABEL: Record<string, string> = {
  highway: 'Tipo', kerb: 'Cordolo', 'kerb:height': 'Altezza cordolo', barrier: 'Barriera', surface: 'Superficie',
  smoothness: 'Regolarità', incline: 'Pendenza', width: 'Larghezza', wheelchair: 'Sedia a rotelle',
  step_count: 'Gradini', 'ramp:wheelchair': 'Rampa', handrail: 'Corrimano', tactile_paving: 'Percorso tattile',
  crossing: 'Attraversamento', amenity: 'Servizio', shop: 'Negozio', tourism: 'Turismo',
};

const dateFmt = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

/**
 * Cosa ha capito l'analisi (Gemma o regole), con la risposta di chi segnala tenuta separata.
 * `category` permette di mostrare un controllo per correggere la categoria (modulo di segnalazione).
 */
export function Interpretation({ interpretation: i, category, followUp }: {
  interpretation: InterpretationData;
  category?: ReactNode;
  followUp?: Report['followUp'];
}) {
  return (
    <div className="interp">
      <dl className="kv">
        {category !== null && <><dt>Tipo</dt><dd>{category ?? CATEGORY_LABEL[i.category]}</dd></>}
        <dt>Riassunto</dt><dd>{i.summary}</dd>
        {i.photo_note && <><dt>Nella foto</dt><dd>{i.photo_note}</dd></>}
        {i.severity !== 'unknown' && <><dt>Gravità</dt><dd>{SEVERITY_LABEL[i.severity]}</dd></>}
      </dl>
      {followUp && (
        <p className="answer"><span>{followUp.question}</span><strong>{followUp.answer}</strong></p>
      )}
      <p className="interp__engine" title={i.model}>
        {i.engine === 'gemma' ? "Letta dall'intelligenza artificiale (Gemma)." : 'Letta in automatico, senza intelligenza artificiale.'}{i.note ? ` ${i.note}` : ''}
      </p>
    </div>
  );
}

function ReportDetail({ report, status, onUpdated }: { report: Report; status: ServerStatus | null; onUpdated: (r: Report) => void }) {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem('openway-admin') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(s: VerificationStatus) {
    setBusy(true); setError(null);
    try {
      onUpdated(await api.setStatus(report.id, s, token));
      try { sessionStorage.setItem('openway-admin', token); } catch { /* storage non disponibile: nessun problema */ }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <h2 className="panel__title">{CATEGORY_LABEL[report.category]}</h2>
      <p className="badge-line">
        <span className={`status status--${report.status}`}>{STATUS_LABEL[report.status]}</span>
        <span className="muted">Segnalata il {dateFmt.format(new Date(report.createdAt))}</span>
      </p>
      {report.blocking === true && (
        <p className="msg msg--warn"><strong>Non si passa</strong> con la sedia a rotelle, secondo {report.blockingSource === 'user' ? 'chi ha segnalato' : "l'analisi della segnalazione"}. I percorsi lo evitano.</p>
      )}
      {report.status === 'unverified' && (
        <p className="msg msg--warn">Segnalata da un utente: nessuno l'ha ancora controllata di persona.</p>
      )}
      <blockquote className="quote">{report.description}</blockquote>
      {report.hasPhoto && <img className="report-photo" src={`/api/reports/${report.id}/photo`} alt="Foto dell'ostacolo allegata da chi segnala" />}
      <Interpretation interpretation={report.interpretation} category={null} followUp={report.followUp} />
      {status?.admin && (
        <details className="admin">
          <summary>Azioni moderatore</summary>
          <p className="field__help">Cambia lo stato solo dopo un sopralluogo o una conferma attendibile. L'analisi automatica non è una verifica.</p>
          <label htmlFor="admin-token" className="field__label">Codice moderatore</label>
          <input id="admin-token" type="password" value={token} onChange={(e) => setToken(e.target.value)} autoComplete="off" />
          <div className="row">
            {VERIFICATION_STATUSES.map((s) => (
              <button key={s} type="button" className="btn btn--secondary btn--sm" disabled={busy || !token || s === report.status} onClick={() => change(s)}>
                {STATUS_LABEL[s]}
              </button>
            ))}
          </div>
          {error && <p className="msg msg--error" role="alert">{error}</p>}
          {report.statusUpdatedAt && <p className="field__help">Stato aggiornato il {dateFmt.format(new Date(report.statusUpdatedAt))}.</p>}
        </details>
      )}
    </>
  );
}

function FeatureDetail({ feature }: { feature: OsmFeature }) {
  const tone = CERTAINTY_CLASS[feature.certainty];
  const plain = feature.scope === 'path' ? PLAIN[feature.kind] : undefined;
  return (
    <>
      <h2 className="panel__title">{feature.label}</h2>
      {(plain || feature.name) && <p className="muted">{[plain, feature.name].filter(Boolean).join(' · ')}</p>}
      <p className="badge-line"><span className={`mk mk--${tone} mk--inline`} aria-hidden="true" /> <strong>{CERTAINTY_LABEL[feature.certainty]}</strong></p>
      <p>{CERTAINTY_HINT[feature.certainty]}</p>
      <details className="more">
        <summary>Dati tecnici (OpenStreetMap)</summary>
        <dl className="kv">
          {Object.entries(feature.tags).filter(([k]) => k !== 'name').map(([k, v]) => (
            <div key={k} className="kv__row"><dt>{TAG_LABEL[k] ?? k}</dt><dd><code>{k}={v}</code></dd></div>
          ))}
        </dl>
        <p className="field__help">
          Fonte: <a href={`https://www.openstreetmap.org/${feature.id}`} target="_blank" rel="noreferrer">OpenStreetMap {feature.id}</a>.
          Il dato può essere incompleto o non aggiornato.
        </p>
      </details>
    </>
  );
}

export function DetailPanel({ selection, status, onClose, onUpdated }: {
  selection: NonNullable<Selection>; status: ServerStatus | null; onClose: () => void; onUpdated: (r: Report) => void;
}) {
  return (
    <section className="panel detail" aria-label="Dettagli dell'elemento selezionato">
      <button type="button" className="btn btn--ghost btn--sm back" onClick={onClose}><Icon name="back" /> Indietro</button>
      {selection.type === 'report'
        ? <ReportDetail report={selection.report} status={status} onUpdated={onUpdated} />
        : <FeatureDetail feature={selection.feature} />}
    </section>
  );
}
