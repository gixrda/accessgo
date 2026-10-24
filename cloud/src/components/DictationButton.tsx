import { useId } from 'react';
import { Mic, Square } from 'lucide-react';
import { useDictation } from '../hooks/useDictation.ts';

export function DictationButton({ onTranscript, disabled, label, maxLength, value, language = 'it', onRecordingStart, autoPrepare = false }: {
  onTranscript: (text: string) => void; disabled?: boolean; label?: string; maxLength?: number; value?: string;
  language?: 'it' | 'auto'; onRecordingStart?: () => void; autoPrepare?: boolean;
}) {
  const dictation = useDictation({ onTranscript, disabled, maxLength, value, language, onRecordingStart });
  const helpId = useId();
  const canTranscribe = dictation.phase === 'recording' || dictation.phase === 'ready';
  const busy = ['requesting', 'stopping', 'transcribing'].includes(dictation.phase);
  return (
    <div className="dictation" data-availability={dictation.configuration} data-supported={dictation.supported}>
      <div className="row">
        <button type="button" className="btn btn--ghost dictation__button"
          disabled={disabled || !dictation.supported || dictation.configuration !== 'ready' || busy}
          aria-pressed={dictation.listening} aria-describedby={helpId}
          onClick={canTranscribe ? dictation.transcribe : dictation.start}>
          {dictation.listening ? <Square size={17} aria-hidden="true" /> : <Mic size={17} aria-hidden="true" />}{' '}
          {dictation.phase === 'requesting' ? 'Consenti il microfono…'
            : dictation.phase === 'stopping' ? 'Completo audio…'
              : dictation.phase === 'transcribing' ? 'Trascrizione ElevenLabs…'
                : canTranscribe ? 'Trascrivi audio' : label ?? (language === 'auto' ? 'Detta la richiesta' : 'Detta in italiano')}
        </button>
        {dictation.phase !== 'idle' && <button type="button" className="btn btn--ghost dictation__button"
          onClick={dictation.cancel}>Annulla audio</button>}
      </div>
      <p id={helpId} className="hint dictation__hint">
        {!dictation.supported ? 'Registrazione non disponibile in questo browser. Puoi digitare il testo.'
          : dictation.configuration === 'checking' ? 'Verifica del servizio ElevenLabs…'
            : dictation.configuration === 'missing' ? 'ElevenLabs non è ancora configurato. Puoi digitare il testo.'
              : dictation.configuration === 'failed' ? 'Servizio ElevenLabs non disponibile. Puoi digitare il testo.'
                : dictation.phase === 'recording' ? `${language === 'auto' ? 'Parla in italiano, inglese o cinese: rilevamento automatico della lingua' : 'Registrazione in italiano'}, massimo 30 secondi. Premi Trascrivi audio per fermare e inviare a ElevenLabs.`
                  : dictation.phase === 'ready' ? 'Registrazione terminata. Premi Trascrivi audio per inviarla a ElevenLabs, oppure Annulla audio.'
                    : dictation.phase === 'transcribing' ? `ElevenLabs sta trascrivendo l’audio. ${autoPrepare ? 'La trascrizione prepara una proposta di itinerario da controllare; nessun percorso viene calcolato finché non confermi.' : 'Il testo non viene pubblicato né cercato automaticamente.'}`
                      : `${language === 'auto' ? 'Italiano, inglese o cinese, con rilevamento automatico della lingua. ' : ''}Registra fino a 30 secondi, poi conferma con Trascrivi audio. L’audio viene inviato a ElevenLabs; AccessGo non lo salva. ${autoPrepare ? 'La trascrizione prepara una proposta di itinerario da controllare; il percorso viene calcolato solo dopo la tua conferma.' : 'Controlla il testo prima di inviarlo.'}`}
      </p>
      {dictation.error && <p className="msg msg--error" role="alert">{dictation.error}</p>}
    </div>
  );
}
