import { REPORT_CATEGORIES, type Report, type ReportCategory, type ServerStatus } from '../../shared/types.ts';
import type { ReportDraft } from '../hooks/useReportDraft.ts';
import { useReportAnalysis } from '../hooks/useReportAnalysis.ts';
import { PanelActions } from './PanelActions.tsx';
import { CATEGORY_LABEL } from '../lib/labels.ts';
import { DictationButton } from './DictationButton.tsx';
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
  const analysis = useReportAnalysis(description);
  const tooShort = description.trim().length < 10;
  const requiresSignIn = Boolean(p.status?.reportRequiresSignIn && !p.status.reportSignedIn);
  const noObstacle = analysis.interpretation?.category === 'no_obstacle';
  const needsClarification = analysis.interpretation?.category === 'unclear' && !category;
  const publicationBlocked = noObstacle || needsClarification;

  if (created) {
    return (
      <section className="panel" aria-labelledby="done-title">
        <div className="notice notice--success" role="status">
          <h2 id="done-title" className="notice__title">Segnalazione inviata</h2>
          È visibile sulla mappa come <strong>non verificata</strong> finché qualcuno non la conferma sul posto.
        </div>
        <Interpretation interpretation={created.interpretation} category={created.category} categorySource={created.categorySource} />
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => p.onShow(created)}>Vedi sulla mappa</button>
          <button type="button" className="btn btn--ghost" onClick={p.draft.startNew}>Nuova segnalazione</button>
        </div>
      </section>
    );
  }

  const aiLabel = !p.status
    ? 'Il metodo usato sarà indicato nel risultato.'
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
        if (p.status && !requiresSignIn && !analysis.isPending() && !publicationBlocked) void p.draft.submit();
      }} noValidate>
        <fieldset className="field">
          <legend className="field__label"><span className="step">1</span> Posizione esatta</legend>
          <p className="field__help">Necessaria solo per pubblicare sulla mappa.</p>
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
          <textarea disabled={submitting} id="desc" rows={4} maxLength={1000} value={description}
            onFocus={() => p.setPickMode(null)} onChange={(e) => { analysis.reset(); setDescription(e.target.value); }}
            placeholder="Es. C'è un gradino alto davanti all'ingresso e non si passa con la sedia a rotelle."
            aria-describedby="desc-help" aria-invalid={error !== null && tooShort} />
          <DictationButton value={description} disabled={submitting || analysis.analysing || description.length >= 1000}
            maxLength={Math.max(0, 1000 - description.length - (description ? 1 : 0))} label="Detta il problema"
            onTranscript={(text) => { p.setPickMode(null); analysis.reset(); setDescription(`${description}${description ? ' ' : ''}${text}`.slice(0, 1000)); }} />
          <p id="desc-help" className="field__help">{aiLabel} <span className="muted">{description.length}/1000</span></p>
        </div>

        <div className="report-analysis">
          <button type="button" className="btn btn--secondary btn--block"
            disabled={tooShort || submitting || analysis.analysing} aria-describedby="analysis-help"
            onClick={() => {
              p.setPickMode(null);
              const active = document.activeElement;
              if (active instanceof HTMLTextAreaElement || active instanceof HTMLInputElement) active.blur();
              void analysis.analyze();
            }}>
            {analysis.analysing ? 'Analisi in corso…' : 'Analizza senza pubblicare'}
          </button>
          <p id="analysis-help" className="field__help">
            Prova anche senza account o posizione. AccessGo non salva né pubblica questa analisi.
            {' '}Se disponibile, il testo viene inviato al servizio AI.
          </p>
          {tooShort && <p className="field__help">Scrivi almeno 10 caratteri per analizzare.</p>}
          <div aria-live="polite" aria-busy={analysis.analysing}>
            {analysis.analysing && <p className="msg" role="status">Analisi del testo in corso. Attendi qualche secondo…</p>}
            {analysis.error && <p className="msg msg--error" role="alert">{analysis.error}</p>}
            {analysis.interpretation && <section className="report-analysis__preview" aria-labelledby="analysis-title">
              <h3 id="analysis-title" className="notice__title">Anteprima · non pubblicata</h3>
              <p className="field__help">Nessun punto aggiunto alla mappa. L'interpretazione non è una verifica sul posto.</p>
              <Interpretation interpretation={analysis.interpretation} />
            </section>}
          </div>
        </div>

        <div className="field">
          <label htmlFor="cat" className="field__label"><span className="step">3</span> Categoria <span className="muted">(facoltativa)</span></label>
          <select disabled={submitting} id="cat" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory | '')}>
            <option value="">Lascia decidere all'interpretazione automatica</option>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>

        {noObstacle && <p className="msg" role="status">Questo testo non verrà pubblicato come ostacolo. Puoi continuare a provare l’analisi oppure descrivere un problema attuale.</p>}
        {needsClarification && <p className="msg" role="status">Prima di pubblicare, chiarisci il problema nel testo oppure scegli una categoria.</p>}
        {error && <p className="msg msg--error" role="alert">{error}</p>}
      </form>
      <PanelActions target={p.actionsTarget}>
        {requiresSignIn ? <>
          <a className="btn btn--accent btn--block" href="/signin-with-chatgpt?return_to=%2F" target="_top" aria-disabled={analysis.analysing}
            onClick={(event) => {
              if (analysis.isPending()) { event.preventDefault(); return; }
              saveReportDraftForSignIn({ point, description, category });
            }}>Accedi per inviare</a>
          <p className="field__help">La bozza rimane in questa scheda se il browser consente il salvataggio locale.</p>
        </> : <button type="submit" form="report-form" className="btn btn--accent btn--block" disabled={submitting || analysis.analysing || publicationBlocked || !point || tooShort || !p.status}>
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
