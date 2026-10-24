import { useId } from 'react';
import { useDictation } from '../hooks/useDictation.ts';

export function DictationButton({ onTranscript, disabled, label = 'Detta in italiano', maxLength, value }: {
  onTranscript: (text: string) => void; disabled?: boolean; label?: string; maxLength?: number; value?: string;
}) {
  const dictation = useDictation({ onTranscript, disabled, maxLength, value });
  const helpId = useId();
  const canTranscribe = dictation.phase === 'recording' || dictation.phase === 'ready';
  const busy = ['requesting', 'stopping', 'transcribing'].includes(dictation.phase);
  return (
    <div className="dictation">
      <div className="row">
        <button type="button" className="btn btn--ghost dictation__button"
          disabled={disabled || !dictation.supported || dictation.configuration !== 'ready' || busy}
          aria-pressed={dictation.listening} aria-describedby={helpId}
          onClick={canTranscribe ? dictation.transcribe : dictation.start}>
          <span aria-hidden="true">{dictation.listening ? '■' : '◉'}</span>{' '}
          {dictation.phase === 'requesting' ? 'Consenti il microfono…'
            : dictation.phase === 'stopping' ? 'Completo audio…'
              : dictation.phase === 'transcribing' ? 'Trascrizione ElevenLabs…'
                : canTranscribe ? 'Trascrivi audio' : label}
        </button>
        {dictation.phase !== 'idle' && <button type="button" className="btn btn--ghost dictation__button"
          onClick={dictation.cancel}>Annulla audio</button>}
      </div>
      <p id={helpId} className="hint dictation__hint">
        {!dictation.supported ? 'Registrazione non disponibile in questo browser. Puoi digitare il testo.'
          : dictation.configuration === 'checking' ? 'Verifica del servizio ElevenLabs…'
            : dictation.configuration === 'missing' ? 'ElevenLabs non è ancora configurato. Puoi digitare il testo.'
              : dictation.configuration === 'failed' ? 'Servizio ElevenLabs non disponibile. Puoi digitare il testo.'
                : dictation.phase === 'recording' ? 'Registrazione in italiano, massimo 30 secondi. Premi Trascrivi audio per fermare e inviare a ElevenLabs.'
                  : dictation.phase === 'ready' ? 'Registrazione terminata. Premi Trascrivi audio per inviarla a ElevenLabs, oppure Annulla audio.'
                    : dictation.phase === 'transcribing' ? 'ElevenLabs sta trascrivendo l’audio. Il testo non viene pubblicato né cercato automaticamente.'
                      : 'Registra fino a 30 secondi, poi conferma con Trascrivi audio. L’audio viene inviato a ElevenLabs; AccessGo non lo salva. Controlla il testo prima di inviarlo.'}
      </p>
      {dictation.error && <p className="msg msg--error" role="alert">{dictation.error}</p>}
    </div>
  );
}
