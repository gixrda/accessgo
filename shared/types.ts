// Tipi condivisi tra frontend (src/) e backend (server/). Coordinate sempre [lat, lng].
export type LatLngTuple = [number, number];

/**
 * Livello di certezza di un'informazione OSM.
 * - known_obstacle: il tag indica un ostacolo (es. highway=steps, kerb=raised, wheelchair=no)
 * - possible_issue: il tag suggerisce una possibile criticità (es. surface=sett, smoothness=bad)
 * - positive_info: il tag indica un elemento favorevole (es. kerb=lowered, wheelchair=yes)
 * - info: dato descrittivo senza criticità note (es. surface=asphalt); serve a misurare la copertura
 */
export type Certainty = 'known_obstacle' | 'possible_issue' | 'positive_info' | 'info';

export type FeatureKind =
  | 'steps' | 'kerb' | 'crossing' | 'barrier' | 'surface'
  | 'smoothness' | 'incline' | 'width' | 'wheelchair';

export interface OsmFeature {
  id: string; // es. "node/123"
  source: 'osm';
  kind: FeatureKind;
  certainty: Certainty;
  /** path = elemento del percorso pedonale; place = accessibilità di un luogo (negozio, edificio…) */
  scope: 'path' | 'place';
  label: string;
  name?: string;
  geometry: { type: 'point'; coords: LatLngTuple } | { type: 'line'; coords: LatLngTuple[] };
  tags: Record<string, string>;
}

export interface OsmDataset {
  source: string;
  fetchedAt: string;
  bbox: [number, number, number, number]; // south, west, north, east
  features: OsmFeature[];
}

export const REPORT_CATEGORIES = [
  'steps', 'kerb', 'obstructed_sidewalk', 'uneven_surface', 'slope', 'crossing', 'other',
] as const;
export type ReportCategory = (typeof REPORT_CATEGORIES)[number];

export const VERIFICATION_STATUSES = ['unverified', 'verified', 'resolved'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export type Severity = 'low' | 'medium' | 'high' | 'unknown';

export interface Interpretation {
  category: ReportCategory;
  obstacle: string | null;
  summary: string;
  severity: Severity;
  missing_info: string[];
  /** gemma = modello AI reale; fallback = regole a parole chiave (non AI) */
  engine: 'gemma' | 'fallback';
  model?: string;
  /** Perché è stato usato il fallback (es. servizio AI non configurato o non disponibile) */
  note?: string;
}

export interface Report {
  id: string;
  lat: number;
  lng: number;
  description: string;
  category: ReportCategory;
  categorySource: 'user' | 'interpretation';
  createdAt: string;
  status: VerificationStatus;
  statusUpdatedAt?: string;
  source: 'user_report';
  interpretation: Interpretation;
}

export interface RouteResult {
  /** wheelchair = profilo ORS per sedia a rotelle; foot_fallback = percorso pedonale standard, NON valutato */
  mode: 'wheelchair' | 'foot_fallback';
  provider: 'openrouteservice' | 'osrm-fossgis';
  coords: LatLngTuple[];
  distanceM: number;
  durationS: number | null;
  /** Motivo del fallback, se ORS era configurato ma non ha risposto */
  notice?: string;
}

export interface ServerStatus {
  routing: 'openrouteservice' | 'fallback';
  ai: 'gemma-google' | 'gemma-ollama' | 'fallback';
  aiModel?: string;
  admin: boolean;
}

export interface GeocodeResult { label: string; lat: number; lng: number }

// Limiti geografici accettati (comune di Pisa, approssimato) e area demo (zona universitaria).
export const PISA_BOUNDS: [number, number, number, number] = [43.66, 10.33, 43.76, 10.47];
export const DEMO_BBOX: [number, number, number, number] = [43.7120, 10.3930, 43.7240, 10.4100];

export function inPisa(lat: unknown, lng: unknown): boolean {
  const [s, w, n, e] = PISA_BOUNDS;
  return typeof lat === 'number' && typeof lng === 'number'
    && Number.isFinite(lat) && Number.isFinite(lng)
    && lat >= s && lat <= n && lng >= w && lng <= e;
}
