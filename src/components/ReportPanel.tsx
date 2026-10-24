import { useState, type FormEvent } from 'react';
import { REPORT_CATEGORIES, type Report, type ReportCategory, type ServerStatus } from '../../shared/types.ts';
import { api } from '../api.ts';
import { CATEGORY_LABEL } from '../lib/labels.ts';
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
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<ReportCategory | ''>('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<Report | null>(null);
  const tooShort = description.trim().length < 10;

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (submitting) return;
    if (!p.point) { setError('Seleziona prima la posizione esatta sulla mappa.'); return; }
    if (tooShort) { setError('Descrivi il problema con almeno 10 caratteri.'); return; }
    setSubmitting(true); setError(null);
    try {
      const r = await api.createReport({ ...p.point, description, ...(category ? { category } : {}) });
      setCreated(r);
      p.onCreated(r);
      p.setPoint(null);
      setDescription(''); setCategory('');
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
        <Interpretation report={created} />
        <div className="row">
          <button type="button" className="btn btn--primary" onClick={() => p.onShow(created)}>Vedi sulla mappa</button>
          <button type="button" className="btn btn--ghost" onClick={() => setCreated(null)}>Nuova segnalazione</button>
        </div>
      </section>
    );
  }

  const aiLabel = p.status?.ai === 'fallback'
    ? 'La descrizione sarà classificata con regole a parole chiave (AI non configurata).'
    : `La descrizione sarà interpretata da Gemma${p.status?.aiModel ? ` (${p.status.aiModel})` : ''}.`;

  return (
    <section className="panel" aria-labelledby="report-title">
      <h2 id="report-title" className="panel__title">Segnala un ostacolo</h2>
      <form onSubmit={submit} noValidate>
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
          <p id="desc-help" className="field__help">{aiLabel} Il testo originale viene sempre conservato. <span className="muted">{description.length}/1000</span></p>
        </div>

        <div className="field">
          <label htmlFor="cat" className="field__label"><span className="step">3</span> Categoria <span className="muted">(facoltativa)</span></label>
          <select id="cat" value={category} onChange={(e) => setCategory(e.target.value as ReportCategory | '')}>
            <option value="">Lascia decidere all'interpretazione automatica</option>
            {REPORT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
          </select>
        </div>

        {error && <p className="msg msg--error" role="alert">{error}</p>}
        <button type="submit" className="btn btn--accent btn--block" disabled={submitting || !p.point || tooShort}>
          {submitting ? 'Invio e interpretazione…' : 'Invia segnalazione'}
        </button>
        {(!p.point || tooShort) && (
          <p className="field__help">{!p.point ? 'Seleziona la posizione sulla mappa' : 'Scrivi almeno 10 caratteri'} per inviare.</p>
        )}
      </form>
    </section>
  );
}
