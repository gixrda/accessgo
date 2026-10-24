import type { Certainty, FeatureKind, ReportCategory, Severity, VerificationStatus } from '../../shared/types.ts';

export const CATEGORY_LABEL: Record<ReportCategory, string> = {
  steps: 'Scale o gradini',
  kerb: 'Cordolo non superabile',
  obstructed_sidewalk: 'Marciapiede ostruito',
  uneven_surface: 'Superficie irregolare',
  slope: 'Pendenza problematica',
  crossing: 'Attraversamento difficoltoso',
  other: 'Altro ostacolo',
};

export const STATUS_LABEL: Record<VerificationStatus, string> = {
  unverified: 'Non verificata',
  verified: 'Verificata',
  resolved: 'Risolta',
};

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  known_obstacle: 'Ostacolo noto',
  possible_issue: 'Possibile difficoltà',
  positive_info: 'Elemento utile',
  info: 'Informazioni mancanti',
};

export const CERTAINTY_HINT: Record<Certainty, string> = {
  known_obstacle: 'Secondo OpenStreetMap qui c\'è un ostacolo per la sedia a rotelle.',
  possible_issue: 'Potrebbe essere una difficoltà: conviene controllare sul posto.',
  positive_info: 'Aiuta il passaggio, ma non garantisce che tutto il tratto sia accessibile.',
  info: 'Mancano le informazioni per capire se si passa.',
};

export const SEVERITY_LABEL: Record<Severity, string> = {
  low: 'Bassa', medium: 'Media', high: 'Alta', unknown: 'Non indicata',
};

export const CATEGORY_ICON: Record<ReportCategory, FeatureKind | 'other'> = {
  steps: 'steps', kerb: 'kerb', obstructed_sidewalk: 'barrier', uneven_surface: 'surface',
  slope: 'incline', crossing: 'crossing', other: 'other',
};
