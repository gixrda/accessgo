import { useState, type ChangeEvent, type FormEvent } from 'react';
import { NOT_SURE, REPORT_CATEGORIES, type Report, type ReportCategory, type ReportDraft, type ServerStatus } from '../../shared/types.ts';
import { api } from '../api.ts';
import { CATEGORY_LABEL } from '../lib/labels.ts';
import { toJpegDataUrl } from '../lib/photo.ts';
import { Icon } from './Icon.tsx';
import { Interpretation } from './DetailPanel.tsx';
import type { PickMode } from './MapView.tsx';

interface Props {
  point: { lat: number; lng: number } | null;
  setPoint: (p: { lat: number; lng: number } | null) => void;
  pickMode: PickMode;
  setPickMode: (m: PickMode) => void;
  onLocate: (target: 'report') => void;
  locating: boolean;
  status: ServerStatus | null;
  onCreated: (r: Report) => void;
  onShow: (r: Report) => void;
}

export function ReportPanel(p: Props) {
  const [description, setDescriptionRaw] = useState('');
  const [photo, setPhotoRaw] = useState<string | null>(null);
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Report | null>(null);
  const tooShort = description.trim().length < 10;
  const usesAi = p.status !== null && p.status.ai !== 'fallback';

  // Cambiare testo o foto invalida l'analisi: quella salvata deve corrispondere a ciò che si invia.
  const resetDraft = () => { setDraft(null); setAnswer(null); };
  const setDescription = (v: string) => { setDescriptionRaw(v); if (draft) resetDraft(); };
  const setPhoto = (v: string | null) => { setPhotoRaw(v); if (draft) resetDraft(); };

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto(await toJpegDataUrl(file));
    } catch {
      setError('Impossibile leggere questa foto. Prova con un altro file JPEG o PNG.');
    }
  }

  async function analyze() {
    if (tooShort) { setError('Descrivi il problema con almeno 10 caratteri.'); return; }
    setAnalyzing(true); setError(null); setAnswer(null);
    try {
      setDraft(await api.draftReport({ description, ...(photo ? { photo } : {}) }));
    } catch (ex) {
      setError((ex as Error).message);
    } finally { setAnalyzing(false); }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting || analyzing) return;
    if (!p.point) { setError('Seleziona prima la posizione esatta sulla mappa.'); return; }
    if (tooShort) { setError('Descrivi il problema con almeno 10 caratteri.'); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await api.createReport({
        ...p.point, description,
        ...(category ? { category } : {}),
        ...(draft ? { draftId: draft.draftId } : {}),
        ...(answer ? { answer } : {}),
      });
      setCreated(r);
      p.onCreated(r);
      p.setPoint(null);
      setDescriptionRaw(''); setPhotoRaw(null); setCategory(''); resetDraft();
    } catch (ex) {
      setError((ex as Error).message);
    } finally { setSubmitting(false); }
  }

  if (created) {
    return (
      <section className="panel" aria-labelledby="done-title">
        <div className="notice notice--success" role="status">
          <h2 id="done-title" className="notice__title">Segnalazione inviata</h2>
          È visibile sulla mappa come <strong>non verificata</strong> finché qualcuno non la conferma sul posto.
        </div>
        <Interpretation interpretation={created.interpretation} category={created.category}
          categorySource={created.categorySource} followUp={created.followUp} />
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => p.onShow(created)}>Vedi sulla mappa</button>
          <button type="button" className="btn btn--ghost" onClick={() => setCreated(null)}>Nuova segnalazione</button>
        </div>
      </section>
    );
  }

  const q = draft?.interpretation.question;

  return (
    <section className="panel" aria-labelledby="report-title">
      <h2 id="report-title" className="panel__title">Segnala un ostacolo</h2>
      <form onSubmit={submit} noValidate className="panel">
        <fieldset className="field">
          <legend className="field__label"><span className="step">1</span> Posizione esatta</legend>
          {p.point ? (
            <div className="place">
              <span className="place__text">Punto selezionato · {p.point.lat.toFixed(5)}, {p.point.lng.toFixed(5)}</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => p.setPickMode('report')}>Sposta</button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className={`btn btn--secondary btn--sm${p.pickMode === 'report' ? ' is-active' : ''}`}
                aria-pressed={p.pickMode === 'report'} onClick={() => p.setPickMode(p.pickMode === 'report' ? null : 'report')}>
                <Icon name="locate" /> {p.pickMode === 'report' ? 'Tocca il punto sulla mappa…' : 'Scegli sulla mappa'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => p.onLocate('report')} disabled={p.locating}>
                {p.locating ? 'Localizzo…' : 'La mia posizione'}
              </button>
            </div>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="desc" className="field__label"><span className="step">2</span> Cosa hai trovato?</label>
          <textarea id="desc" rows={4} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. C'è un gradino alto davanti all'ingresso e non si passa con la sedia a rotelle."
            aria-describedby="desc-help" aria-invalid={error !== null && tooShort} />
          <p id="desc-help" className="field__help">Il testo originale viene sempre conservato. <span className="muted">{description.length}/1000</span></p>
        </div>

        <div className="field">
          <span className="field__label"><span className="step">3</span> Foto <span className="muted">(facoltativa)</span></span>
          {photo ? (
            <div className="photo">
              <img src={photo} alt="Anteprima della foto allegata" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPhoto(null)}>Rimuovi foto</button>
            </div>
          ) : (
            <label className="btn btn--ghost btn--sm file">
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} />
              Aggiungi una foto dell'ostacolo
            </label>
          )}
          <p className="field__help">Inquadra l'ostacolo, evitando volti e targhe. La posizione GPS della foto viene rimossa.</p>
        </div>

        <div className="field">
          <span className="field__label"><span className="step">4</span> Analisi {usesAi ? 'con Gemma' : 'automatica'}</span>
          {!draft && (
            <button type="button" className="btn btn--secondary" onClick={analyze} disabled={analyzing || tooShort}>
              {analyzing ? (usesAi ? 'Gemma sta analizzando…' : 'Analisi…') : usesAi ? 'Analizza con Gemma' : 'Analizza (regole automatiche)'}
            </button>
          )}
          {draft && (
            <div aria-live="polite" className="panel">
              <Interpretation interpretation={draft.interpretation} />
              {q && (
                <fieldset className="question">
                  <legend className="question__text">{q.text}</legend>
                  <div className="row">
                    {[...q.options, NOT_SURE].map((o) => (
                      <button key={o} type="button" className={`btn btn--ghost btn--sm${answer === o ? ' is-active' : ''}`}
                        aria-pressed={answer === o} onClick={() => setAnswer(answer === o ? null : o)}>{o}</button>
                    ))}
                  </div>
                  <p className="field__help">La tua risposta viene salvata come informazione fornita da te, non dall'AI.</p>
                </fieldset>
              )}
              <button type="button" className="btn btn--ghost btn--sm" onClick={analyze} disabled={analyzing}>
                {analyzing ? 'Analisi…' : 'Rianalizza'}
              </button>
            </div>
          )}
          {!draft && <p className="field__help">Facoltativa: puoi anche inviare direttamente.</p>}
        </div>

        <div className="field">
          <label htmlFor="cat" className="field__label"><span className="step">5</span> Categoria <span className="muted">(facoltativa)</span></label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory | '')}>
            <option value="">{draft ? `Usa quella proposta (${CATEGORY_LABEL[draft.interpretation.category]})` : "Lascia decidere all'analisi automatica"}</option>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>

        {error && <p className="msg msg--error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--accent btn--block" disabled={submitting || analyzing || !p.point || tooShort}>
          {submitting ? 'Invio…' : 'Invia segnalazione'}
        </button>
        {(!p.point || tooShort) && (
          <p className="field__help">{!p.point ? 'Seleziona la posizione sulla mappa' : 'Scrivi almeno 10 caratteri'} per inviare.</p>
        )}
      </form>
    </section>
  );
}
