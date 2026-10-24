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
  /** C'è un percorso calcolato: una segnalazione bloccante lo farà ricalcolare */
  hasRoute: boolean;
  onShowRoute: () => void;
}

const PASSABLE = [
  { value: true, label: 'No, blocca il passaggio' },
  { value: false, label: 'Sì, con difficoltà' },
  { value: null, label: 'Non lo so' },
] as const;

/** Segnalazione in due tempi con un solo bottone che avanza: "Continua" fa leggere la descrizione, "Invia" la salva. */
export function ReportPanel(p: Props) {
  const [description, setDescriptionRaw] = useState('');
  const [photo, setPhotoRaw] = useState<string | null>(null);
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [draft, setDraft] = useState<ReportDraft | null>(null);
  const [answer, setAnswer] = useState<string | null>(null);
  // Si passa? Proposto dall'analisi, confermato o corretto da chi segnala.
  const [blocking, setBlocking] = useState<boolean | null>(null);
  const [busy, setBusy] = useState<'analyze' | 'send' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Report | null>(null);
  // Deciso all'invio: subito dopo, il percorso viene ricalcolato e per un attimo non c'è.
  const [rerouted, setRerouted] = useState(false);
  const tooShort = description.trim().length < 10;
  
  // Cambiare testo o foto annulla la lettura: quella salvata deve corrispondere a ciò che si invia.
  const resetDraft = () => { setDraft(null); setAnswer(null); setCategory(''); };
  const setDescription = (v: string) => { setDescriptionRaw(v); if (draft) resetDraft(); };
  const setPhoto = (v: string | null) => { setPhotoRaw(v); if (draft) resetDraft(); };

  async function pickPhoto(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    try {
      setPhoto(await toJpegDataUrl(file));
    } catch {
      setError('Non riusciamo ad aprire questa foto. Prova con un\'altra.');
    }
  }

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (tooShort) { setError('Scrivi almeno 10 caratteri per descrivere il problema.'); return; }
    setError(null);
    if (!draft) {
      setBusy('analyze');
      try {
        const d = await api.draftReport({ description, ...(photo ? { photo } : {}) });
        setDraft(d);
        setBlocking(d.interpretation.blocking);
      } catch (ex) {
        setError((ex as Error).message);
      } finally { setBusy(null); }
      return;
    }
    if (!p.point) { setError('Indica prima sulla mappa dove si trova l\'ostacolo.'); return; }
    setBusy('send');
    try {
      const r = await api.createReport({
        ...p.point, description, draftId: draft.draftId, blocking,
        ...(category ? { category } : {}),
        ...(answer ? { answer } : {}),
      });
      setCreated(r);
      setRerouted(r.blocking === true && p.hasRoute);
      p.onCreated(r);
      p.setPoint(null);
      setDescriptionRaw(''); setPhotoRaw(null); resetDraft();
    } catch (ex) {
      setError((ex as Error).message);
    } finally { setBusy(null); }
  }

  if (created) {
    return (
      <section className="panel" aria-labelledby="done-title">
        <div className="verdict verdict--calm" role="status">
          <Icon name="check" size={22} />
          <div>
            <h2 id="done-title" className="verdict__title">Grazie, segnalazione inviata</h2>
            <p className="verdict__text">
              {created.blocking === true
                ? (rerouted
                  ? 'Blocca il passaggio: abbiamo ricalcolato il tuo percorso per evitarlo.'
                  : 'Blocca il passaggio: da ora i percorsi calcolati lo eviteranno.')
                : `È sulla mappa con il simbolo «${CATEGORY_LABEL[created.category]}».`}
              {' '}Resta da controllare sul posto.
            </p>
          </div>
        </div>
        <div className="row">
          {rerouted && <button type="button" className="btn btn--primary" onClick={p.onShowRoute}>Vedi il nuovo percorso</button>}
          <button type="button" className={`btn ${rerouted ? 'btn--ghost' : 'btn--primary'}`} onClick={() => p.onShow(created)}>Vedi sulla mappa</button>
          <button type="button" className="btn btn--ghost" onClick={() => setCreated(null)}>Nuova segnalazione</button>
        </div>
      </section>
    );
  }

  const q = draft?.interpretation.question;
  const cta = busy === 'analyze' ? 'Stiamo leggendo la segnalazione…'
    : busy === 'send' ? 'Invio…'
    : draft ? 'Invia segnalazione' : 'Continua';

  return (
    <section className="panel" aria-labelledby="report-title">
      <h2 id="report-title" className="panel__title">Segnala un ostacolo</h2>
      <form onSubmit={submit} noValidate className="panel">
        <fieldset className="field">
          <legend className="field__label">Dove si trova?</legend>
          {p.point ? (
            <div className="place">
              <Icon name="pin" />
              <span className="place__text">Punto scelto sulla mappa</span>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => p.setPickMode('report')}>Sposta</button>
            </div>
          ) : (
            <div className="row">
              <button type="button" className={`btn btn--secondary btn--sm${p.pickMode === 'report' ? ' is-active' : ''}`}
                aria-pressed={p.pickMode === 'report'} onClick={() => p.setPickMode(p.pickMode === 'report' ? null : 'report')}>
                <Icon name="pin" /> {p.pickMode === 'report' ? 'Tocca il punto sulla mappa…' : 'Scegli sulla mappa'}
              </button>
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => p.onLocate('report')} disabled={p.locating}>
                <Icon name="locate" /> {p.locating ? 'Cerco dove sei…' : 'La mia posizione'}
              </button>
            </div>
          )}
        </fieldset>

        <div className="field">
          <label htmlFor="desc" className="field__label">Cosa hai trovato?</label>
          <textarea id="desc" rows={3} maxLength={1000} value={description} onChange={(e) => setDescription(e.target.value)}
            placeholder="Es. C'è un gradino alto davanti all'ingresso e non si passa."
            aria-invalid={error !== null && tooShort} />
          {photo ? (
            <div className="photo">
              <img src={photo} alt="Anteprima della foto allegata" />
              <button type="button" className="btn btn--ghost btn--sm" onClick={() => setPhoto(null)}>Togli la foto</button>
            </div>
          ) : (
            <label className="btn btn--ghost btn--sm file">
              <input type="file" accept="image/*" capture="environment" className="sr-only" onChange={pickPhoto} />
              <Icon name="camera" /> Aggiungi una foto <span className="muted">(facoltativa)</span>
            </label>
          )}
        </div>

        {draft && (
          <div className="field" aria-live="polite">
            <h3 className="section-title">Abbiamo capito così</h3>
            <p className="field__help">Se qualcosa non va, correggi il tipo o modifica la descrizione.</p>
            <Interpretation
              interpretation={draft.interpretation}
              category={
                <select aria-label="Tipo di ostacolo" value={category || draft.interpretation.category}
                  onChange={(e) => setCategory(e.target.value as ReportCategory)}>
                  {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
                </select>
              }
            />
            <fieldset className="question">
              <legend className="question__text">Si riesce a passare con la sedia a rotelle?</legend>
              <div className="row">
                {PASSABLE.map((o) => (
                  <button key={o.label} type="button" className={`btn btn--ghost btn--sm${blocking === o.value ? ' is-active' : ''}`}
                    aria-pressed={blocking === o.value} onClick={() => setBlocking(o.value)}>{o.label}</button>
                ))}
              </div>
              {blocking === true && <p className="field__help">I percorsi eviteranno questo punto.</p>}
            </fieldset>
            {q && (
              <fieldset className="question">
                <legend className="question__text">{q.text}</legend>
                <div className="row">
                  {[...q.options, NOT_SURE].map((o) => (
                    <button key={o} type="button" className={`btn btn--ghost btn--sm${answer === o ? ' is-active' : ''}`}
                      aria-pressed={answer === o} onClick={() => setAnswer(answer === o ? null : o)}>{o}</button>
                  ))}
                </div>
              </fieldset>
            )}
          </div>
        )}

        {error && <p className="msg msg--error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--accent btn--block" disabled={busy !== null || tooShort || (draft !== null && !p.point)}>
          {cta}
        </button>
        {!busy && (tooShort || (draft && !p.point)) && (
          <p className="field__help">{tooShort ? 'Scrivi almeno 10 caratteri per continuare.' : 'Indica sulla mappa dove si trova per inviare.'}</p>
        )}
      </form>
    </section>
  );
}
