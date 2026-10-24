import { useId } from 'react';
import { useDictation } from '../hooks/useDictation.ts';
import { Icon } from './Icon.tsx';

/** Registra fino a 30 secondi, poi invia a ElevenLabs solo quando chi parla preme "Trascrivi". Il testo resta modificabile. */
export function DictationButton({ onTranscript, disabled, label = 'Detta', maxLength, value }: {
  onTranscript: (text: string) => void; disabled?: boolean; label?: string; maxLength?: number; value?: string;
}) {
  const d = useDictation({ onTranscript, disabled, maxLength, value });
  const helpId = useId();
  const canTranscribe = d.phase === 'recording' || d.phase === 'ready';
  const busy = ['requesting', 'stopping', 'transcribing'].includes(d.phase);
  const hint = !d.supported ? 'Il microfono non è disponibile in questo browser: puoi scrivere il testo.'
    : d.configuration === 'checking' ? 'Controllo del servizio vocale…'
    : d.configuration !== 'ready' ? 'La voce non è attiva su questo server: puoi scrivere il testo.'
    : d.phase === 'recording' ? 'Sto registrando (massimo 30 secondi). Premi Trascrivi quando hai finito.'
    : d.phase === 'ready' ? 'Registrazione terminata: premi Trascrivi, oppure Annulla.'
    : d.phase === 'transcribing' ? 'Sto trascrivendo…'
    : null;
  return (
    <div className="dictation">
      <div className="row">
        <button type="button" className={`btn btn--ghost btn--sm dictation__button${d.listening ? ' is-active' : ''}`}
          disabled={disabled || !d.supported || d.configuration !== 'ready' || busy}
          aria-pressed={d.listening} aria-describedby={hint ? helpId : undefined} aria-busy={busy}
          onClick={canTranscribe ? d.transcribe : d.start}>
          <Icon name={d.listening ? 'stop' : 'mic'} />
          {d.phase === 'requesting' ? 'Consenti il microfono…' : d.phase === 'stopping' ? 'Un momento…'
            : d.phase === 'transcribing' ? 'Trascrivo…' : canTranscribe ? 'Trascrivi' : label}
        </button>
        {d.phase !== 'idle' && !busy && (
          <button type="button" className="btn btn--ghost btn--sm" onClick={d.cancel}>Annulla</button>
        )}
      </div>
      {hint && <p id={helpId} className="dictation__hint" role="status">{hint}</p>}
      {d.error && <p className="msg msg--error" role="alert">{d.error}</p>}
    </div>
  );
}
