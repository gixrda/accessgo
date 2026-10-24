import type { LatLngTuple, RouteResult } from '../../shared/types.ts';
import { formatDistance } from '../lib/analysis.ts';
import { navigationBlocked } from '../lib/navigation.ts';
import { useVoiceNavigation } from '../hooks/useVoiceNavigation.ts';

export function NavigationPanel({ route, onPosition }: { route: RouteResult; onPosition?: (coordinate: LatLngTuple) => void }) {
  const navigation = useVoiceNavigation(route, onPosition);
  if (navigationBlocked(route)) return <section className="voice-navigation" aria-labelledby="voice-navigation-title">
    <p id="voice-navigation-title"><strong>Guida vocale disattivata</strong> · Ricalcola il percorso dopo aver controllato gli ostacoli indicati.</p>
  </section>;
  if (!navigation.available) return <section className="voice-navigation" aria-labelledby="voice-navigation-title">
    <p id="voice-navigation-title"><strong>Guida vocale non disponibile</strong> · {route.mode !== 'wheelchair'
      ? 'Questo percorso non usa il profilo sedia a rotelle.'
      : 'Il servizio non ha fornito indicazioni di svolta utilizzabili. Consulta la mappa.'}</p>
  </section>;
  return (
    <section className="voice-navigation" aria-labelledby="voice-navigation-title">
      <h3 id="voice-navigation-title" className="sr-only">Guida vocale</h3>
      {!navigation.supported && <p className="msg">Riproduzione audio non disponibile in questo browser.</p>}
      {navigation.checking && <p className="hint">Verifica del servizio ElevenLabs…</p>}
      {navigation.supported && !navigation.gpsSupported && <p className="msg">Per la guida serve un browser con posizione GPS e una connessione HTTPS. Puoi comunque ascoltare l’anteprima.</p>}
      <div className="voice-navigation__actions">
        <button type="button" className={`btn ${navigation.active ? 'btn--ghost' : 'btn--primary'}`}
          disabled={!navigation.active && (!navigation.supported || !navigation.configured || !navigation.gpsSupported || !navigation.available)}
          onClick={navigation.active ? navigation.stop : navigation.start}>
          {navigation.active ? 'Interrompi guida vocale' : 'Avvia guida vocale'}
        </button>
      </div>
      <p className="hint">Voce ElevenLabs · richiede GPS e schermo acceso.</p>
      <p className="voice-navigation__status" role="status">{navigation.status}</p>
      {navigation.audioLoading && <p className="hint" role="status">Preparazione audio ElevenLabs…</p>}
      {navigation.audioPlaying && <p className="hint" role="status">Audio ElevenLabs in riproduzione.</p>}
      {(navigation.audioLoading || navigation.audioPlaying) && (
        <button type="button" className="btn btn--ghost" onClick={navigation.stopAudio}>Interrompi audio in corso</button>
      )}
      {navigation.voiceError && <p className="msg msg--error" role="alert">{navigation.voiceError}</p>}
      {navigation.active && navigation.readyPosition && navigation.upcoming && (
        <div className="voice-navigation__next">
          <strong>Prossima indicazione · circa {formatDistance(navigation.upcomingDistanceM ?? 0)}</strong>
          <p>{navigation.upcomingInstruction}</p>
          <span className="hint">Restano circa {formatDistance(navigation.remainingM)}</span>
        </div>
      )}
      <details className="voice-navigation__options">
        <summary>Opzioni voce e indicazioni</summary>
        <p className="hint">Il testo delle indicazioni viene inviato a ElevenLabs per generare l’audio. Su iPhone la guida può interrompersi cambiando app o bloccando lo schermo.</p>
        <div className="voice-navigation__actions">
          <button type="button" className="btn btn--ghost" onClick={navigation.testVoice} disabled={!navigation.supported || !navigation.configured}>Prova voce ElevenLabs</button>
          <button type="button" className="btn btn--ghost" onClick={() => navigation.preview()}
            disabled={!navigation.supported || !navigation.configured || !navigation.available}>Ascolta prossima indicazione</button>
        </div>
        <p className="hint">La guida legge le indicazioni del servizio di routing. Non verifica gli ostacoli sul posto e non ricalcola automaticamente se esci dal percorso.</p>
        {navigation.instructions.length > 0 && <>
          <h4>Indicazioni del percorso ({navigation.instructions.length})</h4>
          <ol className="voice-navigation__instructions">
            {navigation.instructions.map((step, index) => (
              <li key={`${step.legIndex}-${step.shapeIndex}-${index}`}>
                <span className="hint">Tratto {String.fromCharCode(65 + step.legIndex)} → {String.fromCharCode(66 + step.legIndex)}</span>
                <p>{step.instruction}</p>
                <button type="button" className="btn btn--ghost" disabled={!navigation.supported || !navigation.configured}
                  onClick={() => navigation.preview(index)} aria-label={`Ascolta indicazione ${index + 1}`}>
                  Ascolta anteprima
                </button>
              </li>
            ))}
          </ol>
        </>}
      </details>
    </section>
  );
}
