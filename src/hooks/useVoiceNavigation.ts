import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useElevenLabsVoice } from './useElevenLabsVoice.ts';
import { distanceMeters } from '../../shared/navigation.ts';
import type { LatLngTuple } from '../../shared/types.ts';
import {
  distanceInstruction, maneuverInstruction, navigationGeometry, nextManeuver, projectNavigationPosition, usableManeuvers,
  type NavigationProgress, type NavigationRoute,
} from '../lib/navigation.ts';

const INITIAL_STATUS = 'Avvia la guida quando sei vicino alla partenza. Le distanze GPS sono approssimative.';

export function useVoiceNavigation(route: NavigationRoute, onPosition?: (coordinate: LatLngTuple) => void) {
  const geometry = useMemo(() => navigationGeometry(route.coords), [route.coords]);
  const maneuvers = useMemo(() => usableManeuvers(route), [route]);
  const voice = useElevenLabsVoice();
  const { speak, cancel: cancelSpeech, reset: resetVoice } = voice;
  const [gpsSupported, setGpsSupported] = useState(false);
  const [active, setActive] = useState(false);
  const [status, setStatus] = useState(INITIAL_STATUS);
  const [distanceM, setDistanceM] = useState(0);
  const [upcomingIndex, setUpcomingIndex] = useState<number | null>(null);
  const [readyPosition, setReadyPosition] = useState(false);
  const [arrived, setArrived] = useState(false);
  const watch = useRef<number | null>(null);
  const epoch = useRef(0);
  const running = useRef(false);
  const progress = useRef<NavigationProgress | null>(null);
  const completed = useRef(new Set<number>());
  const advanced = useRef(new Set<number>());
  const nearAnnounced = useRef(new Set<number>());
  const lastGuidanceIndex = useRef<number | null>(null);
  const lastFix = useRef(0);
  const callback = useRef(onPosition);
  callback.current = onPosition;
  const latestRoute = useRef(route);
  latestRoute.current = route;

  const clear = useCallback(() => {
    epoch.current += 1;
    running.current = false;
    if (watch.current !== null) navigator.geolocation?.clearWatch(watch.current);
    watch.current = null;
    cancelSpeech();
  }, [cancelSpeech]);

  const stop = useCallback((message = 'Guida vocale interrotta. Puoi riavviarla dalla partenza.') => {
    clear();
    setActive(false);
    setReadyPosition(false);
    setStatus(message);
  }, [clear]);

  useEffect(() => {
    setGpsSupported(Boolean(window.isSecureContext && navigator.geolocation));
  }, []);

  useEffect(() => {
    clear();
    resetVoice();
    progress.current = null;
    completed.current.clear();
    advanced.current.clear();
    nearAnnounced.current.clear();
    lastGuidanceIndex.current = null;
    lastFix.current = 0;
    setActive(false);
    setDistanceM(0);
    setUpcomingIndex(null);
    setReadyPosition(false);
    setArrived(false);
    setStatus(INITIAL_STATUS);
    return clear;
  }, [route, clear, resetVoice]);

  useEffect(() => {
    const hidden = () => {
      if (document.hidden) {
        if (running.current) stop('Guida in pausa: riapri OpenWay, ricalcola dalla tua posizione e riavvia la guida. Il browser non garantisce la guida a schermo spento.');
        else cancelSpeech();
      }
    };
    const leaving = () => { if (running.current) stop('Guida interrotta. Riavviala quando torni su OpenWay.'); else cancelSpeech(); };
    document.addEventListener('visibilitychange', hidden);
    window.addEventListener('pagehide', leaving);
    return () => {
      document.removeEventListener('visibilitychange', hidden);
      window.removeEventListener('pagehide', leaving);
    };
  }, [stop, cancelSpeech]);

  useEffect(() => {
    if (!active) return;
    const timer = setInterval(() => {
      if (running.current && lastFix.current && Date.now() - lastFix.current > 15_000) {
        cancelSpeech();
        setReadyPosition(false);
        setStatus('Posizione GPS non aggiornata. Indicazioni in attesa.');
      }
    }, 5000);
    return () => clearInterval(timer);
  }, [active, cancelSpeech]);

  function start() {
    if (running.current || !geometry || !maneuvers.length || !voice.supported || !voice.configured
      || !window.isSecureContext || !navigator.geolocation) return;
    clear();
    const id = epoch.current;
    const currentRoute = route;
    const current = () => running.current && epoch.current === id && latestRoute.current === currentRoute;
    running.current = true;
    progress.current = null;
    completed.current.clear();
    advanced.current.clear();
    nearAnnounced.current.clear();
    lastGuidanceIndex.current = null;
    lastFix.current = 0;
    setDistanceM(0);
    setUpcomingIndex(null);
    setReadyPosition(false);
    setArrived(false);
    setActive(true);
    setStatus('Attendo una posizione GPS precisa. Consenti l’accesso alla posizione nel browser.');
    // Unlock audio in this user gesture; do not spend a TTS request on a synthetic startup instruction.
    void voice.activate();
    try {
      watch.current = navigator.geolocation.watchPosition((position) => {
        if (!current()) return;
        const coordinate: LatLngTuple = [position.coords.latitude, position.coords.longitude];
        const fix = { coordinate, accuracyM: position.coords.accuracy, timestamp: position.timestamp };
        const projected = projectNavigationPosition(geometry, fix, progress.current);
        if (projected.status !== 'ready') {
          cancelSpeech();
          setReadyPosition(false);
          setStatus(projected.message);
          return;
        }
        const previous = progress.current;
        progress.current = projected.progress;
        lastFix.current = position.timestamp;
        setDistanceM(projected.progress.distanceM);
        setReadyPosition(true);
        callback.current?.(coordinate);
        const remaining = geometry.totalM - projected.progress.distanceM;
        const atEnd = remaining <= 15 && position.coords.accuracy <= 20
          && distanceMeters(coordinate, geometry.coords.at(-1)!) <= 15;
        // Arrival requires a prior accepted fix, route progress and proximity to the real endpoint.
        if (previous && atEnd) {
          const arrival = maneuvers.at(-1);
          if (arrival && arrival.type === 'arrive') speak(arrival.instruction);
          setArrived(true);
          setStatus('Vicino alla destinazione secondo il GPS. Controlla il punto di arrivo sulla mappa.');
          running.current = false;
          epoch.current += 1;
          if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
          watch.current = null;
          setActive(false);
          return;
        }
        // Speaking a nearby turn does not mean it has been passed. Keep it current until GPS progress crosses it.
        maneuvers.forEach((step, index) => {
          if (step.routeDistanceM < projected.progress.distanceM - 5) completed.current.add(index);
        });
        const next = nextManeuver(maneuvers, projected.progress.distanceM, completed.current);
        if (lastGuidanceIndex.current !== null && next?.index !== lastGuidanceIndex.current) cancelSpeech();
        lastGuidanceIndex.current = next?.index ?? null;
        setUpcomingIndex(next?.index ?? null);
        setStatus('Guida attiva. Mantieni OpenWay aperto e lo schermo acceso.');
        if (!next) return;
        const isFinalArrival = next.index === maneuvers.length - 1 && next.maneuver.type === 'arrive';
        const nearCoordinate = distanceMeters(coordinate, next.maneuver.coordinate);
        const instruction = maneuverInstruction(maneuvers, next.index);
        if (next.distanceM <= 20 && nearCoordinate <= 25 && !isFinalArrival && !nearAnnounced.current.has(next.index)) {
          nearAnnounced.current.add(next.index);
          advanced.current.add(next.index);
          speak(instruction);
        } else if (next.distanceM > 25 && next.distanceM <= 110 && !advanced.current.has(next.index)) {
          advanced.current.add(next.index);
          speak(distanceInstruction(instruction, next.distanceM));
        }
      }, (error) => {
        if (!current()) return;
        cancelSpeech();
        setReadyPosition(false);
        if (error.code === 1) stop('Posizione non autorizzata. Abilitala nelle impostazioni del browser per usare la guida vocale.');
        else setStatus(error.code === 3 ? 'GPS in attesa: ricerca della posizione scaduta. Le indicazioni riprenderanno con un segnale preciso.'
          : 'Posizione non disponibile. Indicazioni in attesa di un segnale GPS preciso.');
      }, { enableHighAccuracy: true, maximumAge: 0, timeout: 15_000 });
    } catch {
      stop('Impossibile accedere alla posizione. Controlla i permessi del browser.');
    }
  }

  function preview(index?: number) {
    const selected = typeof index === 'number' && Number.isInteger(index) ? maneuvers[index] : null;
    const next = selected ? { maneuver: selected, distanceM: 0, index: index! }
      : nextManeuver(maneuvers, distanceM, completed.current) ?? (maneuvers.length ? { maneuver: maneuvers[0], distanceM: 0, index: 0 } : null);
    if (next) speak(`Anteprima dell’indicazione: ${maneuverInstruction(maneuvers, next.index)}`);
  }

  const upcoming = upcomingIndex !== null ? maneuvers[upcomingIndex] : null;
  return {
    supported: voice.supported, configured: voice.configured, checking: voice.checking, audioLoading: voice.loading,
    audioPlaying: voice.playing, stopAudio: cancelSpeech,
    gpsSupported, available: maneuvers.length > 0, instructions: maneuvers, active, arrived, status, voiceError: voice.error,
    readyPosition, distanceM, remainingM: Math.max(0, (geometry?.totalM ?? 0) - distanceM),
    upcoming, upcomingInstruction: upcomingIndex !== null ? maneuverInstruction(maneuvers, upcomingIndex) : null,
    upcomingDistanceM: upcoming ? Math.max(0, upcoming.routeDistanceM - distanceM) : null,
    start, stop: () => stop(), preview, testVoice: () => speak('Questa è la voce italiana di OpenWay, generata da ElevenLabs. La prova audio non avvia la navigazione.'),
  };
}
