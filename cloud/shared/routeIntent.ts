/** Place names are search proposals, never coordinates or verified destinations. */
export interface RoutePlaceIntent {
  query: string;
  /** Literal excerpt of the user's request supporting this place. */
  evidence: string;
}

export interface RouteIntent {
  intent: 'route' | 'unclear';
  origin: RoutePlaceIntent | null;
  destination: RoutePlaceIntent | null;
  via: RoutePlaceIntent[];
  /** A proposal only: the UI must request location explicitly after user confirmation. */
  useCurrentLocation: boolean;
  clarification: string | null;
  engine: 'gemma' | 'fallback' | 'search';
  model?: string;
  note?: string;
}
