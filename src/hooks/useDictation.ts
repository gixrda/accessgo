import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoiceStatus, transcribeAudio } from '../lib/voiceApi.ts';

type Phase = 'idle' | 'requesting' | 'recording' | 'stopping' | 'ready' | 'transcribing';
type Configuration = 'checking' | 'ready' | 'missing' | 'failed';
interface Capture {
  source: string | undefined;
  language: 'it' | 'auto';
  stream?: MediaStream;
  recorder?: MediaRecorder;
  chunks: Blob[];
  bytes: number;
  blob?: Blob;
  uploadOnStop: boolean;
  controller?: AbortController;
  timer?: ReturnType<typeof setTimeout>;
}
let activeDictation: { capture: Capture; cancel: () => void } | null = null;
const MAX_AUDIO_BYTES = 2 * 1024 * 1024;
const MAX_RECORDING_MS = 30_000;

function recordingAvailable() {
  return typeof window !== 'undefined' && window.isSecureContext
    && typeof navigator.mediaDevices?.getUserMedia === 'function' && typeof MediaRecorder === 'function';
}
function releaseMicrophone(capture: Capture) {
  if (capture.timer) clearTimeout(capture.timer);
  capture.timer = undefined;
  capture.stream?.getTracks().forEach((track) => track.stop());
  capture.stream = undefined;
}

/** Local bounded recording followed by an explicit ElevenLabs transcription request. */
export function useDictation({ onTranscript, value, disabled = false, maxLength = 1000, language = 'it', onRecordingStart }: {
  onTranscript: (text: string) => void; value?: string; disabled?: boolean; maxLength?: number;
  language?: 'it' | 'auto'; onRecordingStart?: () => void;
}) {
  const [supported, setSupported] = useState(false);
  const [configuration, setConfiguration] = useState<Configuration>('checking');
  const [phase, setPhase] = useState<Phase>('idle');
  const [error, setError] = useState<string | null>(null);
  const capture = useRef<Capture | null>(null);
  const latest = useRef({ onTranscript, value, disabled, maxLength, language, onRecordingStart });
  latest.current = { onTranscript, value, disabled, maxLength, language, onRecordingStart };

  const discard = useCallback(() => {
    const current = capture.current;
    capture.current = null;
    if (!current) return;
    if (activeDictation?.capture === current) activeDictation = null;
    current.controller?.abort();
    const recorder = current.recorder;
    if (recorder) {
      recorder.ondataavailable = null; recorder.onstop = null; recorder.onerror = null;
      try { if (recorder.state !== 'inactive') recorder.stop(); } catch { /* Browser already stopped. */ }
    }
    releaseMicrophone(current);
    current.chunks = []; current.blob = undefined;
  }, []);
  const cancel = useCallback(() => { discard(); setPhase('idle'); }, [discard]);

  useEffect(() => {
    setSupported(Boolean(recordingAvailable()));
    let live = true;
    getVoiceStatus().then((status) => {
      if (live) setConfiguration(status.configured ? 'ready' : 'missing');
    }).catch(() => { if (live) setConfiguration('failed'); });
    return () => { live = false; };
  }, []);
  useEffect(() => { cancel(); }, [value, disabled, language, cancel]);
  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', cancel);
    return () => {
      discard();
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', cancel);
    };
  }, [discard, cancel]);

  const isCurrent = (current: Capture) => capture.current === current
    && !latest.current.disabled && latest.current.value === current.source && latest.current.language === current.language;

  async function upload(current: Capture) {
    if (!isCurrent(current) || current.controller) return;
    const audio = current.blob;
    if (!audio?.size || audio.size > MAX_AUDIO_BYTES) {
      cancel(); setError('Audio vuoto o troppo grande. Registra di nuovo, per un massimo di 30 secondi.'); return;
    }
    current.controller = new AbortController();
    setPhase('transcribing');
    try {
      const text = (await transcribeAudio(audio, current.controller.signal, current.language)).trim();
      if (!isCurrent(current)) return;
      cancel();
      if (!text) { setError('Non sono state rilevate parole. Riprova o scrivi il testo.'); return; }
      const remaining = Math.max(0, latest.current.maxLength);
      if (text.length > remaining) {
        setError(`La trascrizione contiene ${text.length} caratteri, ma in questo campo ne restano ${remaining}. Il testo esistente non è stato modificato. Accorcia il testo manualmente oppure registra un messaggio più breve.`);
        return;
      }
      latest.current.onTranscript(text);
    } catch (reason) {
      if (!isCurrent(current)) return;
      cancel();
      setError(reason instanceof Error ? reason.message : 'Trascrizione ElevenLabs non disponibile. Riprova o scrivi il testo.');
    }
  }

  function finishRecording(current: Capture, uploadOnStop: boolean) {
    if (!isCurrent(current) || !current.recorder || current.recorder.state === 'inactive') return;
    current.uploadOnStop = uploadOnStop;
    if (current.timer) clearTimeout(current.timer);
    current.timer = undefined;
    setPhase('stopping');
    try { current.recorder.stop(); } catch {
      cancel(); setError('Impossibile completare la registrazione. Riprova o scrivi il testo.');
    }
  }

  async function start() {
    if (!recordingAvailable() || configuration !== 'ready' || latest.current.disabled || capture.current) return;
    activeDictation?.cancel();
    const current: Capture = { source: latest.current.value, language: latest.current.language, chunks: [], bytes: 0, uploadOnStop: false };
    capture.current = current;
    activeDictation = { capture: current, cancel };
    setPhase('requesting'); setError(null);
    try {
      latest.current.onRecordingStart?.();
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      if (!isCurrent(current)) { stream.getTracks().forEach((track) => track.stop()); return; }
      current.stream = stream;
      const mimeType = ['audio/webm;codecs=opus', 'audio/mp4', 'audio/webm'].find((type) => MediaRecorder.isTypeSupported(type));
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 64_000 } : undefined);
      current.recorder = recorder;
      recorder.ondataavailable = ({ data }) => {
        if (!isCurrent(current) || !data.size) return;
        current.bytes += data.size;
        if (current.bytes > MAX_AUDIO_BYTES) {
          cancel(); setError('Registrazione troppo grande (massimo 2 MB). Riprova con un messaggio più breve.'); return;
        }
        current.chunks.push(data);
      };
      recorder.onerror = () => {
        if (!isCurrent(current)) return;
        cancel(); setError('Registrazione interrotta dal browser. Riprova o scrivi il testo.');
      };
      recorder.onstop = () => {
        releaseMicrophone(current);
        if (!isCurrent(current)) return;
        current.blob = new Blob(current.chunks, { type: recorder.mimeType || current.chunks[0]?.type || 'audio/webm' });
        current.chunks = [];
        if (!current.blob.size) { cancel(); setError('Audio vuoto. Riprova o scrivi il testo.'); return; }
        setPhase('ready');
        // The 30-second cutoff never uploads audio. Only the explicit transcription button does.
        if (current.uploadOnStop) void upload(current);
      };
      recorder.start(1000);
      setPhase('recording');
      current.timer = setTimeout(() => finishRecording(current, false), MAX_RECORDING_MS);
    } catch (reason) {
      if (!isCurrent(current)) return;
      cancel();
      setError(reason && typeof reason === 'object' && 'name' in reason && reason.name === 'NotAllowedError'
        ? 'Microfono non autorizzato. Abilitalo nelle impostazioni del browser oppure scrivi il testo.'
        : 'Microfono non disponibile. Puoi scrivere il testo manualmente.');
    }
  }

  function transcribe() {
    const current = capture.current;
    if (!current || !isCurrent(current)) return;
    if (current.blob) void upload(current);
    else finishRecording(current, true);
  }

  return { supported, configuration, phase, listening: phase === 'recording', error, start, transcribe, cancel, stop: cancel };
}
