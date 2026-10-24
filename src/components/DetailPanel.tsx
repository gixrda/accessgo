import { useState } from 'react';
import { VERIFICATION_STATUSES, type OsmFeature, type Report, type ServerStatus, type VerificationStatus } from '../../shared/types.ts';
import { api } from '../api.ts';
import { CATEGORY_LABEL, CERTAINTY_HINT, CERTAINTY_LABEL, SEVERITY_LABEL, STATUS_LABEL } from '../lib/labels.ts';
import type { Selection } from './MapView.tsx';

const CERTAINTY_CLASS = { known_obstacle: 'known', possible_issue: 'possible', positive_info: 'positive', info: 'info' } as const;
const TAG_LABEL: Record<string, string> = {
  highway: 'Tipo', kerb: 'Cordolo', 'kerb:height': 'Altezza cordolo', barrier: 'Barriera', surface: 'Superficie',
  smoothness: 'Regolarità', incline: 'Pendenza', width: 'Larghezza', wheelchair: 'Sedia a rotelle',
  step_count: 'Gradini', 'ramp:wheelchair': 'Rampa', handrail: 'Corrimano', tactile_paving: 'Percorso tattile',
  crossing: 'Attraversamento', amenity: 'Servizio', shop: 'Negozio', tourism: 'Turismo',
};

const dateFmt = new Intl.DateTimeFormat('it-IT', { dateStyle: 'medium', timeStyle: 'short' });

export function Interpretation({ report }: { report: Report }) {
  const i = report.interpretation;
  return (
    <div className="interp">
      <p className="interp__engine">
        {i.engine === 'gemma'
          ? <>Interpretata dall'AI <strong>{i.model}</strong></>
          : <><strong>Classificazione a regole</strong> (non AI){i.note ? ` — ${i.note}` : ''}</>}
      </p>
      <dl className="kv">
        <dt>Categoria</dt>
        <dd>{CATEGORY_LABEL[report.category]} <span className="muted">({report.categorySource === 'user' ? 'scelta da chi segnala' : 'proposta automaticamente'})</span></dd>
        {i.obstacle && <><dt>Ostacolo</dt><dd>{i.obstacle}</dd></>}
        <dt>Sintesi</dt><dd>{i.summary}</dd>
        <dt>Gravità</dt><dd>{SEVERITY_LABEL[i.severity]}</dd>
      </dl>
      {i.missing_info.length > 0 && (
        <>
          <p className="interp__sub">Informazioni mancanti</p>
          <ul className="bullets">{i.missing_info.map((m) => <li key={m}>{m}</li>)}</ul>
        </>
      )}
    </div>
  );
}

function ReportDetail({ report, status, onUpdated }: { report: Report; status: ServerStatus | null; onUpdated: (r: Report) => void }) {
  const [token, setToken] = useState(() => { try { return sessionStorage.getItem('accessgo-admin') ?? ''; } catch { return ''; } });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function change(s: VerificationStatus) {
    setBusy(true); setError(null);
    try {
      onUpdated(await api.setStatus(report.id, s, token));
      try { sessionStorage.setItem('accessgo-admin', token); } catch { /* storage non disponibile: nessun problema */ }
    } catch (e) { setError((e as Error).message); } finally { setBusy(false); }
  }

  return (
    <>
      <p className="eyebrow">Segnalazione utente</p>
      <h2 className="panel__title">{CATEGORY_LABEL[report.category]}</h2>
      <p><span className={`status status--${report.status}`}>{STATUS_LABEL[report.status]}</span></p>
      {report.status === 'unverified' && (
        <p className="msg msg--warn">Non ancora verificata: l'informazione proviene da un utente e non è stata confermata sul posto.</p>
      )}
      <p className="interp__sub">Descrizione originale</p>
      <blockquote className="quote">{report.description}</blockquote>
      <Interpretation report={report} />
      <dl className="kv">
        <dt>Inviata</dt><dd>{dateFmt.format(new Date(report.createdAt))}</dd>
        {report.statusUpdatedAt && <><dt>Stato aggiornato</dt><dd>{dateFmt.format(new Date(report.statusUpdatedAt))}</dd></>}
        <dt>Posizione</dt><dd>{report.lat.toFixed(5)}, {report.lng.toFixed(5)} <span className="muted">(scelta sulla mappa)</span></dd>
      </dl>
      {status?.admin && (
        <details className="admin">
          <summary>Azioni moderatore</summary>
          <p className="field__help">Cambia lo stato solo dopo un sopralluogo o una conferma attendibile. L'interpretazione automatica non è una verifica.</p>
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
        </details>
      )}
    </>
  );
}

function FeatureDetail({ feature }: { feature: OsmFeature }) {
  const tone = CERTAINTY_CLASS[feature.certainty];
  return (
    <>
      <p className="eyebrow">{feature.scope === 'place' ? 'Luogo · OpenStreetMap' : 'Dato OpenStreetMap'}</p>
      <h2 className="panel__title">{feature.label}</h2>
      {feature.name && <p className="muted">{feature.name}</p>}
      <p className="badge-line"><span className={`mk mk--${tone} mk--inline`} aria-hidden="true" /> <strong>{CERTAINTY_LABEL[feature.certainty]}</strong></p>
      <p className="field__help">{CERTAINTY_HINT[feature.certainty]}</p>
      <dl className="kv">
        {Object.entries(feature.tags).filter(([k]) => k !== 'name').map(([k, v]) => (
          <div key={k} className="kv__row"><dt>{TAG_LABEL[k] ?? k}</dt><dd><code>{k}={v}</code></dd></div>
        ))}
      </dl>
      <p className="field__help">
        Fonte: <a href={`https://www.openstreetmap.org/${feature.id}`} target="_blank" rel="noreferrer">OpenStreetMap {feature.id}</a>.
        Il dato può essere incompleto o non aggiornato.
      </p>
    </>
  );
}

export function DetailPanel({ selection, status, onClose, onUpdated }: {
  selection: NonNullable<Selection>; status: ServerStatus | null; onClose: () => void; onUpdated: (r: Report) => void;
}) {
  return (
    <section className="panel detail" aria-label="Dettagli dell'elemento selezionato">
      <button type="button" className="btn btn--ghost btn--sm back" onClick={onClose}>← Indietro</button>
      {selection.type === 'report'
        ? <ReportDetail report={selection.report} status={status} onUpdated={onUpdated} />
        : <FeatureDetail feature={selection.feature} />}
    </section>
  );
}
