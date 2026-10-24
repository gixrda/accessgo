import { inPisa } from '../../shared/types.ts';

export interface PlanningLocation {
  lat: number;
  lng: number;
  /** Reported accuracy radius in metres, never a guarantee of an exact entrance. */
  accuracy: number;
  /** Callers must ask for confirmation before applying an approximate position. */
  approximate: boolean;
}

export interface PlanningLocationOptions {
  geolocation?: Pick<Geolocation, 'getCurrentPosition'> | null;
  now?: () => number;
  secure?: boolean;
}

const MANUAL = 'Puoi scegliere un punto sulla mappa o scrivere un indirizzo.';
const DENIED = 'Posizione non autorizzata. Su iPhone, consenti la posizione nelle impostazioni del sito in Safari e nei servizi di localizzazione dell’iPhone, poi riprova. ' + MANUAL;
const UNAVAILABLE = 'Posizione non disponibile. Controlla che la localizzazione sia attiva e riprova, possibilmente all’aperto. ' + MANUAL;
const TIMEOUT = 'La ricerca della posizione ha impiegato troppo tempo. Riprova vicino a una finestra o all’aperto. ' + MANUAL;

class PositionFailure extends Error {
  constructor(public code: number) { super(code === 1 ? DENIED : code === 3 ? TIMEOUT : UNAVAILABLE); }
}

function failure(cause: unknown): PositionFailure {
  if (cause && typeof cause === 'object') {
    const value = cause as { code?: unknown; name?: unknown };
    if (value.name === 'SecurityError' || value.name === 'NotAllowedError' || value.code === 1) return new PositionFailure(1);
    if (value.code === 2 || value.code === 3) return new PositionFailure(value.code);
  }
  return new PositionFailure(0);
}

function requestPosition(geolocation: Pick<Geolocation, 'getCurrentPosition'>, precise: boolean): Promise<GeolocationPosition> {
  return new Promise((resolve, reject) => {
    let settled = false;
    const finish = (action: () => void) => {
      if (settled) return;
      settled = true;
      action();
    };
    try {
      geolocation.getCurrentPosition(
        (position) => finish(() => resolve(position)),
        (error) => finish(() => reject(failure(error))),
        { enableHighAccuracy: precise, timeout: precise ? 12_000 : 10_000, maximumAge: 15_000 },
      );
    } catch (cause) { finish(() => reject(failure(cause))); }
  });
}

function validatedLocation(position: GeolocationPosition, now: number): PlanningLocation {
  const lat = position?.coords?.latitude;
  const lng = position?.coords?.longitude;
  const accuracy = position?.coords?.accuracy;
  const timestamp = position?.timestamp;
  if (!Number.isFinite(lat) || !Number.isFinite(lng) || !Number.isFinite(accuracy) || accuracy < 0
    || !Number.isFinite(timestamp) || !Number.isFinite(now) || timestamp > now || now - timestamp > 60_000) {
    throw new Error('Il browser ha restituito una posizione non valida o non aggiornata. Riprova. ' + MANUAL);
  }
  if (!inPisa(lat, lng)) throw new Error('La posizione rilevata è fuori dall’area di Pisa coperta da AccessGo. ' + MANUAL);
  if (accuracy > 1000) throw new Error('La posizione è troppo imprecisa (errore superiore a 1 km). Scegli un punto sulla mappa o scrivi un indirizzo.');
  return { lat, lng, accuracy, approximate: accuracy > 100 };
}

/** Explicit one-shot planning location. Never called on mount and never stores or sends GPS data. */
export async function locateForPlanning(options: PlanningLocationOptions = {}): Promise<PlanningLocation> {
  const secure = options.secure ?? (typeof window !== 'undefined' && window.isSecureContext);
  if (!secure) throw new Error('Per usare la posizione, apri AccessGo tramite un indirizzo HTTPS. ' + MANUAL);
  let geolocation: PlanningLocationOptions['geolocation'];
  try { geolocation = options.geolocation !== undefined ? options.geolocation : typeof navigator !== 'undefined' ? navigator.geolocation : null; }
  catch (cause) { throw failure(cause); }
  if (!geolocation || typeof geolocation.getCurrentPosition !== 'function') {
    throw new Error('Geolocalizzazione non supportata da questo browser. ' + MANUAL);
  }
  let position: GeolocationPosition;
  try { position = await requestPosition(geolocation, true); }
  catch (cause) {
    if (!(cause instanceof PositionFailure) || (cause.code !== 2 && cause.code !== 3)) throw cause;
    // A Wi-Fi/cell estimate can still help plan a route after high-accuracy positioning fails.
    // Never retry a permission denial or fabricate a position from an IP address.
    position = await requestPosition(geolocation, false);
  }
  return validatedLocation(position, (options.now ?? Date.now)());
}
