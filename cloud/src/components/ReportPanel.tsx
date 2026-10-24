import { REPORT_CATEGORIES, type Report, type ReportCategory, type ServerStatus } from '../../shared/types.ts';
import type { ReportDraft } from '../hooks/useReportDraft.ts';
import { PanelActions } from './PanelActions.tsx';
import { CATEGORY_LABEL } from '../lib/labels.ts';
import { Icon } from './Icon.tsx';
import { Interpretation } from './DetailPanel.tsx';
import type { PickMode } from './MapView.tsx';
import { saveReportDraftForSignIn } from '../lib/reportSession.ts';

interface Props {
  draft: ReportDraft;
  actionsTarget?: HTMLElement | null;
  pickMode: PickMode;
  setPickMode: (m: PickMode) => void;
  onLocate: (target: 'report') => void;
  locating: boolean;
  status: ServerStatus | null;
  onShow: (r: Report) => void;
}

export function ReportPanel(p: Props) {
  const { point, description, setDescription, category, setCategory, submitting, error, created } = p.draft;
  const tooShort = description.trim().length < 10;
  const requiresSignIn = Boolean(p.status?.reportRequiresSignIn && !p.status.reportSignedIn);

  if (created) {
    return (
      <section className="panel" aria-labelledby="done-title">
        <div className="notice notice--success" role="status">
          <h2 id="done-title" className="notice__title">Segnalazione inviata</h2>
          È visibile sulla mappa come <strong>non verificata</strong> finché qualcuno non la conferma sul posto.
        </div>
        <Interpretation report={created} />
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => p.onShow(created)}>Vedi sulla mappa</button>
          <button type="button" className="btn btn--ghost" onClick={p.draft.startNew}>Nuova segnalazione</button>
        </div>
      </section>
    );
  }

  const aiLabel = !p.status
    ? 'Stato del servizio non disponibile: il metodo usato sarà indicato dopo l’invio.'
    : p.status.ai === 'fallback'
    ? 'La descrizione sarà classificata con regole a parole chiave (AI non configurata).'
    : `La descrizione sarà interpretata da Gemma${p.status?.aiModel ? ` (${p.status.aiModel})` : ''}.`;

  return (
    <section className="panel" aria-labelledby="report-title">
      <h2 id="report-title" className="panel__title">Segnala un ostacolo</h2>
      {requiresSignIn && <p className="notice notice--info">
        Puoi consultare la mappa e calcolare percorsi senza account. Per pubblicare una segnalazione, accedi con ChatGPT.
      </p>}
      <form id="report-form" className="report-form" onSubmit={(event) => {
        event.preventDefault();
        if (p.status && !requiresSignIn) void p.draft.submit();
      }} noValidate>
        <fieldset className="field">
          <legend className="field__label"><span className="step">1</span> Posizione esatta</legend>
          {point ? (
            <div className="place">
              <span className="place__text">Punto selezionato · {point.lat.toFixed(5)}, {point.lng.toFixed(5)}</span>
              <button type="button" className="btn btn--ghost btn--sm" disabled={submitting} onClick={() => p.setPickMode('report')}>Sposta</button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className={`btn btn--secondary btn--sm${p.pickMode === 'report' ? ' is-active' : ''}`}
                disabled={submitting} aria-pressed={p.pickMode === 'report'} onClick={() => p.setPickMode(p.pickMode === 'report' ? null : 'report')}>
                <Icon name="locate" /> {p.pickMode === 'report' ? 'Tocca il punto sulla mappa…' : 'Scegli sulla mappa'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => p.onLocate('report')} disabled={p.locating || submitting}>
                {p.locating ? 'Localizzo…' : 'La mia posizione'}
              </button>
            </div>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="desc" className="field__label"><span className="step">2</span> Cosa hai trovato?</label>
          <textarea disabled={submitting} id="desc" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. C'è un gradino alto davanti all'ingresso e non si passa con la sedia a rotelle."
            aria-describedby="desc-help" aria-invalid={error !== null && tooShort} />
          <p id="desc-help" className="field__help">{aiLabel} Il testo originale viene sempre conservato. <span className="muted">{description.length}/1000</span></p>
        </div>

        <div className="field">
          <label htmlFor="cat" className="field__label"><span className="step">3</span> Categoria <span className="muted">(facoltativa)</span></label>
          <select disabled={submitting} id="cat" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory | '')}>
            <option value="">Lascia decidere all'interpretazione automatica</option>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>

        {error && <p className="msg msg--error" role="alert">{error}</p>}
      </form>
      <PanelActions target={p.actionsTarget}>
        {requiresSignIn ? <>
          <a className="btn btn--accent btn--block" href="/signin-with-chatgpt?return_to=%2F" target="_top"
            onClick={() => { saveReportDraftForSignIn({ point, description, category }); }}>Accedi per inviare</a>
          <p className="field__help">La bozza rimane in questa scheda se il browser consente il salvataggio locale.</p>
        </> : <button type="submit" form="report-form" className="btn btn--accent btn--block" disabled={submitting || !point || tooShort || !p.status}>
          {submitting ? 'Invio e interpretazione…' : 'Invia segnalazione'}
        </button>}
        {!p.status && <p className="field__help">Accesso al servizio non disponibile. Ricarica la pagina per riprovare.</p>}
        {!requiresSignIn && (!point || tooShort) && (
          <p className="field__help">{!point ? 'Seleziona la posizione sulla mappa' : 'Scrivi almeno 10 caratteri'} per inviare.</p>
        )}
      </PanelActions>
    </section>
  );
}
