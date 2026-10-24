import { useId, useState } from 'react';
import { Info } from 'lucide-react';
import { DictationButton } from './DictationButton.tsx';
import { dismissKeyboard } from '../lib/formViewport.ts';

/** One top-level entry point for a place name, a typed trip, or a recorded request. */
export function MapSearchBar({ onRequest, onEdit, disabled = false }: {
  onRequest: (text: string) => void; onEdit?: () => void; disabled?: boolean;
}) {
  const id = useId();
  const [text, setText] = useState('');
  const [voiceOpen, setVoiceOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  function submit(source: string) {
    const value = source.trim();
    if (disabled) return;
    if (value.length < 3 || value.length > 500) {
      setError('Scrivi un luogo o una richiesta da 3 a 500 caratteri.'); return;
    }
    setError(null); setVoiceOpen(false); dismissKeyboard(); onRequest(value);
  }
  return <section className="map-search" aria-label="Ricerca sulla mappa">
    <form className="map-search__row" role="search" aria-label="Cerca luoghi e percorsi" onSubmit={(event) => { event.preventDefault(); submit(text); }}>
      <label className="sr-only" htmlFor={`${id}-query`}>Cerca un luogo o chiedi un percorso</label>
      <input id={`${id}-query`} type="search" value={text} maxLength={500} disabled={disabled} enterKeyHint="search" autoComplete="off"
        placeholder="Dove vuoi andare?" onChange={(event) => { onEdit?.(); setText(event.target.value); setError(null); }} />
      <button type="submit" className="btn btn--primary map-search__submit" disabled={disabled || text.trim().length < 3}>Cerca</button>
      <div className="map-search__voice" data-open={voiceOpen} id={`${id}-voice`}>
        <DictationButton label="Parla" language="auto" autoPrepare maxLength={500} value={text} disabled={disabled}
          onRecordingStart={() => { onEdit?.(); setVoiceOpen(true); setError(null); }}
          onTranscript={(transcript) => { setText(transcript); submit(transcript); }} />
      </div>
      <button type="button" className="map-search__info" aria-label="Informazioni sulla voce" aria-controls={`${id}-voice`}
        aria-expanded={voiceOpen} onClick={() => setVoiceOpen(true)}><Info size={18} aria-hidden="true" /></button>
    </form>
    {error && <p className="msg msg--error" role="alert">{error}</p>}
  </section>;
}
