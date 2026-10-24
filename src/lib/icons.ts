import type { FeatureKind } from '../../shared/types.ts';

// Glifi SVG 16×16 a tratto, usati sia nei marker Leaflet (come stringa HTML) sia nei pannelli.
export type IconName = FeatureKind | 'place' | 'report' | 'other' | 'start' | 'end' | 'locate'
  | 'warning' | 'info' | 'swap' | 'search' | 'road' | 'check' | 'pin' | 'camera' | 'back' | 'block';

const PATHS: Record<IconName, string> = {
  steps: 'M2 14h4v-4h4V6h4V2',
  kerb: 'M1 5h7v7h7',
  crossing: 'M3 2v12M6.5 2v12M10 2v12M13.5 2v12',
  barrier: 'M6 3h4v10H6zM4 13h8M6 6h4',
  surface: 'M1 7c2-3 4 3 7 0s5 3 7 0M1 12c2-3 4 3 7 0s5 3 7 0',
  smoothness: 'M1 7c2-3 4 3 7 0s5 3 7 0M1 12c2-3 4 3 7 0s5 3 7 0',
  incline: 'M1 14L15 4v10z',
  width: 'M1 8h14M4 5L1 8l3 3M12 5l3 3-3 3',
  wheelchair: 'M7.5 5.5V10h4l1.8 3.5M6 7.6a4 4 0 1 0 5.4 5.2M8.6 3a1.3 1.3 0 1 1-2.6 0 1.3 1.3 0 0 1 2.6 0z',
  place: 'M3 14V5l5-3 5 3v9M6 14v-4h4v4',
  report: 'M4 14V2M4 2h9l-2 3 2 3H4',
  other: 'M8 3v6M8 12v1',
  start: 'M8 4a4 4 0 1 1 0 8 4 4 0 0 1 0-8z',
  end: 'M4 14V2h9l-2 3 2 3H4',
  locate: 'M8 1v3M8 12v3M1 8h3M12 8h3M8 5a3 3 0 1 1 0 6 3 3 0 0 1 0-6z',
  warning: 'M8 1.8L15 14H1zM8 6.5v3.5M8 12.2v.3',
  info: 'M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM8 7.2v4.3M8 4.8v.3',
  swap: 'M5 2v12M2 5l3-3 3 3M11 14V2M8 11l3 3 3-3',
  search: 'M7 2a5 5 0 1 1 0 10A5 5 0 0 1 7 2zM10.6 10.6L14.5 14.5',
  road: 'M4.5 1L2 15M11.5 1L14 15M8 2v2.5M8 7v2.5M8 12v2.5',
  check: 'M2.5 8.5l3.5 3.5 7.5-8',
  pin: 'M8 15s5-4.6 5-8.5A5 5 0 0 0 3 6.5C3 10.4 8 15 8 15zM8 4.7a1.8 1.8 0 1 1 0 3.6 1.8 1.8 0 0 1 0-3.6z',
  camera: 'M2 5h3l1.5-2h3L11 5h3v8H2zM8 6.8a2.3 2.3 0 1 1 0 4.6 2.3 2.3 0 0 1 0-4.6z',
  back: 'M10 3L5 8l5 5',
  block: 'M8 1.5a6.5 6.5 0 1 1 0 13 6.5 6.5 0 0 1 0-13zM3.4 3.4l9.2 9.2',
};

export function iconSvg(name: IconName, size = 16): string {
  return `<svg width="${size}" height="${size}" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="${PATHS[name]}"/></svg>`;
}
