import { useCallback, useEffect, useRef, useState } from 'react';
import { getVoiceStatus, requestVoiceAudio } from '../lib/voiceApi.ts';

type AudioWindow = Window & { webkitAudioContext?: typeof AudioContext };

function audioConstructor() {
  if (typeof window === 'undefined') return undefined;
  return window.AudioContext ?? (window as AudioWindow).webkitAudioContext;
}

/** ElevenLabs audio only. Web Audio is unlocked by the user's click, including on Safari. */
export function useElevenLabsVoice() {
  const [supported, setSupported] = useState(false);
  const [configured, setConfigured] = useState(false);
  const [checking, setChecking] = useState(true);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const context = useRef<AudioContext | null>(null);
  const source = useRef<AudioBufferSourceNode | null>(null);
  const request = useRef<AbortController | null>(null);
  const revision = useRef(0);
  const mounted = useRef(true);
  const cache = useRef(new Map<string, AudioBuffer>());
  const configuredRef = useRef(false);

  const cancel = useCallback(() => {
    revision.current += 1;
    request.current?.abort();
    request.current = null;
    if (source.current) {
      try { source.current.stop(); } catch { /* Playback may have ended. */ }
      source.current.disconnect();
      source.current = null;
    }
    if (mounted.current) { setLoading(false); setPlaying(false); }
  }, []);

  useEffect(() => {
    mounted.current = true;
    setSupported(Boolean(audioConstructor()));
    let current = true;
    getVoiceStatus().then((status) => {
      if (!current) return;
      configuredRef.current = status.configured;
      setConfigured(status.configured);
      setError(status.configured ? null : 'ElevenLabs non configurato. Puoi leggere le indicazioni sullo schermo.');
    }).catch((cause: unknown) => {
      if (current) setError(cause instanceof Error ? cause.message : 'Stato ElevenLabs non disponibile.');
    }).finally(() => { if (current) setChecking(false); });
    return () => {
      current = false;
      mounted.current = false;
      cancel();
      cache.current.clear();
      if (context.current && context.current.state !== 'closed') void context.current.close().catch(() => {});
      context.current = null;
    };
  }, [cancel]);

  const reset = useCallback(() => { cancel(); cache.current.clear(); }, [cancel]);

  const unlock = useCallback(async () => {
    const Constructor = audioConstructor();
    if (!Constructor || !configuredRef.current) throw new Error('Voce ElevenLabs non disponibile. Puoi leggere le indicazioni sullo schermo.');
    if (!context.current || context.current.state === 'closed') context.current = new Constructor();
    if (context.current.state !== 'running') await context.current.resume();
    if (context.current.state !== 'running') throw new Error('Audio bloccato dal browser. Premi Prova voce e controlla il volume.');
    return context.current;
  }, []);

  const activate = useCallback(async () => {
    setError(null);
    try { await unlock(); return true; } catch (cause) {
      if (mounted.current) setError(cause instanceof Error ? cause.message : 'Riproduzione audio non disponibile.');
      return false;
    }
  }, [unlock]);

  const speak = useCallback((text: string) => {
    cancel();
    const id = revision.current;
    const controller = new AbortController();
    request.current = controller;
    setError(null);
    setLoading(true);
    // Calling resume before the first await keeps the iPhone user-gesture permission.
    const audioContext = unlock();
    const current = () => mounted.current && revision.current === id && !controller.signal.aborted;
    void (async () => {
      try {
        const audio = await audioContext;
        if (!current()) return;
        let buffer = cache.current.get(text);
        if (!buffer) {
          const blob = await requestVoiceAudio(text, controller.signal);
          if (!current()) return;
          buffer = await audio.decodeAudioData(await blob.arrayBuffer());
          if (!current()) return;
          cache.current.set(text, buffer);
          while (cache.current.size > 5) cache.current.delete(cache.current.keys().next().value!);
        }
        if (!current() || audio.state !== 'running') return;
        const playback = audio.createBufferSource();
        playback.buffer = buffer;
        playback.connect(audio.destination);
        source.current = playback;
        playback.onended = () => {
          playback.disconnect();
          if (source.current === playback) {
            source.current = null;
            if (mounted.current) setPlaying(false);
          }
        };
        playback.start();
        setPlaying(true);
      } catch (cause) {
        if (current()) setError(cause instanceof Error ? cause.message : 'Audio ElevenLabs non disponibile. Leggi le indicazioni sullo schermo.');
      } finally {
        if (current()) { request.current = null; setLoading(false); }
      }
    })();
  }, [cancel, unlock]);

  return { supported, configured, checking, loading, playing, error, speak, cancel, reset, activate };
}
