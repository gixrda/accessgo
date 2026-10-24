import type { Certainty, FeatureKind, InterpretationCategory, ReportCategory, Severity, VerificationStatus } from '../../shared/types.ts';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  steps: 'Scale o gradini',
  kerb: 'Cordolo non superabile',
  obstructed_sidewalk: 'Marciapiede ostruito',
  uneven_surface: 'Superficie irregolare',
  slope: 'Pendenza problematica',
  crossing: 'Attraversamento difficoltoso',
  other: 'Altro ostacolo',
};

export const INTERPRETATION_LABEL: Record<InterpretationCategory, string> = {
  ...CATEGORY_LABEL,
  no_obstacle: 'Nessun ostacolo segnalato',
  unclear: 'Descrizione da chiarire',
};

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  unverified: 'Non verificata',
  verified: 'Verificata',
  resolved: 'Risolta',
};

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  known_obstacle: 'Ostacolo noto',
  possible_issue: 'Possibile criticità',
  positive_info: 'Elemento favorevole',
  info: 'Dato incompleto',
};

export const CERTAINTY_HINT: Record<Certainty, string> = {
  known_obstacle: 'Il dato OpenStreetMap indica un ostacolo per la sedia a rotelle.',
  possible_issue: 'Il dato OpenStreetMap suggerisce una possibile difficoltà: va valutata sul posto.',
  positive_info: 'Il dato OpenStreetMap indica un elemento favorevole. Non garantisce l\'accessibilità dell\'intero tratto.',
  info: 'Elemento mappato senza informazioni sufficienti a valutarne l\'accessibilità.',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Bassa', medium: 'Media', high: 'Alta', unknown: 'Non indicata',
};

export const CATEGORY_ICON: Record<ReportCategory, FeatureKind | 'other'> = {
  steps: 'steps', kerb: 'kerb', obstructed_sidewalk: 'barrier', uneven_surface: 'surface',
  slope: 'incline', crossing: 'crossing', other: 'other',
};
