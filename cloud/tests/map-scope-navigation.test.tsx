// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LatLngTuple, OsmFeature, Report, RouteResult } from '../shared/types.ts';
import { api } from '../src/api.ts';
import App from '../src/App.tsx';
import type { RouteAnalysis } from '../src/lib/analysis.ts';
import { scopedMapData, withMapSelection, type MapScope, type MapSelection } from '../src/lib/mapScope.ts';

vi.mock('../src/api.ts', () => ({
  api: { status: vi.fn(), osm: vi.fn(), reports: vi.fn(), route: vi.fn(), geocode: vi.fn(), createReport: vi.fn() },
}));

// Keep the real App, route requests, analysis, layer controls and report form.
// Only Leaflet is replaced; use the same display-data helper as the real MapView.
vi.mock('../src/components/MapView.tsx', () => ({
  MapView: (p: {
    features: OsmFeature[]; reports: Report[]; analysis: RouteAnalysis | null; scope: MapScope; selection: MapSelection;
    onPick: (point: { lat: number; lng: number }) => void; onSelect: (selection: MapSelection) => void;
    from: { label: string } | null; to: { label: string } | null; reportPoint: { lat: number; lng: number } | null;
  }) => {
    const data = withMapSelection(scopedMapData(p.features, p.reports, p.analysis, p.scope), p.selection);
    return <div>
      <output aria-label="Rendered features">{data.features.map((f) => f.id).join(',')}</output>
      <output aria-label="Rendered reports">{data.reports.map((r) => r.id).join(',')}</output>
      <output aria-label="Endpoint labels">{p.from?.label}/{p.to?.label}</output>
      <output aria-label="Draft pin">{JSON.stringify(p.reportPoint)}</output>
      <button onClick={() => p.onPick({ lat: routeCoords[0][0], lng: routeCoords[0][1] })}>Pick start fixture</button>
      <button onClick={() => p.onPick({ lat: routeCoords[1][0], lng: routeCoords[1][1] })}>Pick end fixture</button>
      <button onClick={() => p.onSelect({ type: 'feature', feature: farFeature })}>Select comparison fixture</button>
    </div>;
  },
}));
const routeCoords: LatLngTuple[] = [[43.716, 10.4], [43.716, 10.405]];
const mainRoute: RouteResult = { mode: 'wheelchair', provider: 'valhalla', coords: routeCoords, distanceM: 400, durationS: 300 };
const nearFeature: OsmFeature = { id: 'near-osm', source: 'osm', kind: 'kerb', certainty: 'possible_issue', scope: 'path', label: 'Near fixture',
  geometry: { type: 'point', coords: [43.716, 10.402] }, tags: { kerb: 'raised' } };
const farFeature: OsmFeature = { ...nearFeature, id: 'comparison-only', label: 'Comparison fixture', geometry: { type: 'point', coords: [43.718, 10.402] } };
const nearReport: Report = { id: 'near-report', lat: 43.716, lng: 10.402, description: 'Test fixture', category: 'kerb', categorySource: 'user', source: 'user_report',
  createdAt: '', status: 'unverified', interpretation: { category: 'kerb', obstacle: null, summary: '', severity: 'unknown', missing_info: [], engine: 'fallback' } };
const resolvedReport: Report = { ...nearReport, id: 'resolved-report', status: 'resolved' };

beforeEach(() => {
  vi.resetAllMocks();
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'fallback', admin: false });
  vi.mocked(api.osm).mockResolvedValue({ source: 'test fixture', fetchedAt: '', bbox: [43.7, 10.3, 43.8, 10.5], features: [nearFeature, farFeature] });
  vi.mocked(api.reports).mockResolvedValue([nearReport, resolvedReport]);
  vi.mocked(api.route).mockImplementation(async (_from, _to, profile) => profile === 'foot'
    ? { ...mainRoute, mode: 'foot', coords: [[43.718, 10.4], [43.718, 10.405]] } : mainRoute);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
async function mount() { await act(async () => { render(<App />); }); }
async function calculate() {
  fireEvent.click(screen.getAllByRole('button', { name: 'Scegli sulla mappa' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Pick start fixture' }));
  fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pick end fixture' }));
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Calcola percorso' })));
}
const rendered = (label: string) => screen.getByLabelText(label).textContent;
const allToggle = () => {
  const button = screen.getByRole('button', { name: 'Legenda e livelli' });
  if (button.getAttribute('aria-expanded') !== 'true') fireEvent.click(button);
  return screen.getByRole('checkbox', { name: 'Mostra tutti gli ostacoli' });
};

describe('map scope through App navigation', () => {
  it('ends map picking after choosing a search result, so later map clicks cannot overwrite it', async () => {
    await mount();
    fireEvent.click(screen.getAllByRole('button', { name: 'Scegli sulla mappa' })[0]);
    const found = { label: 'Via Roma, Pisa', lat: 43.72, lng: 10.395 };
    vi.mocked(api.geocode).mockResolvedValue([found]);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Partenza' }), { target: { value: 'Via Roma' } });
    await act(async () => fireEvent.submit(screen.getByRole('search', { name: 'Cerca partenza' })));
    fireEvent.click(screen.getByRole('button', { name: found.label }));
    expect(screen.queryByText('Tocca la mappa per scegliere la partenza')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Pick start fixture' }));
    expect(rendered('Endpoint labels')).toBe('Via Roma, Pisa/');
  });
  it('defaults to an uncluttered map, enables explicit exploration, and returns to route-only display', async () => {
    await mount();
    expect(rendered('Rendered features')).toBe('');
    expect(rendered('Rendered reports')).toBe('');
    expect((allToggle() as HTMLInputElement).checked).toBe(false);
    fireEvent.click(allToggle());
    expect(rendered('Rendered features')).toBe('near-osm,comparison-only');
    expect(rendered('Rendered reports')).toBe('near-report,resolved-report');
    fireEvent.click(allToggle());
    expect(rendered('Rendered features')).toBe('');
    await calculate();
    expect(rendered('Rendered features')).toBe('near-osm');
    expect(rendered('Rendered reports')).toBe('near-report');
    fireEvent.click(allToggle());
    expect(rendered('Rendered features')).toBe('near-osm,comparison-only');
    fireEvent.click(allToggle());
    expect(rendered('Rendered features')).toBe('near-osm');
    expect(rendered('Rendered reports')).toBe('near-report');
  });
  it('removes stale route obstacles when an endpoint is cleared and allows a single selected comparison', async () => {
    await mount(); await calculate();
    fireEvent.click(screen.getByRole('button', { name: 'Select comparison fixture' }));
    expect(rendered('Rendered features')).toBe('near-osm,comparison-only');
    expect(screen.getByText(/elemento selezionato fuori filtro/)).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Indietro/ }));
    expect(rendered('Rendered features')).toBe('near-osm');
    fireEvent.click(screen.getByRole('button', { name: 'Rimuovi destinazione' }));
    expect(rendered('Rendered features')).toBe('');
    expect(rendered('Rendered reports')).toBe('');
    expect(screen.queryByText(/elemento selezionato fuori filtro/)).toBeNull();
  });
  it('clears current overlays during recalculation and does not include the comparison result', async () => {
    await mount(); await calculate();
    let complete!: (value: RouteResult) => void;
    const pending = new Promise<RouteResult>((resolve) => { complete = resolve; });
    vi.mocked(api.route).mockImplementation(async (_from, _to, profile) => profile === 'foot'
      ? { ...mainRoute, mode: 'foot', coords: [[43.718, 10.4], [43.718, 10.405]] } : pending);
    fireEvent.click(screen.getByRole('button', { name: 'Calcola percorso' }));
    expect(rendered('Rendered features')).toBe('');
    expect(rendered('Rendered reports')).toBe('');
    await act(async () => complete(mainRoute));
    expect(rendered('Rendered features')).toBe('near-osm');
    expect(rendered('Rendered reports')).toBe('near-report');
  });
  it('keeps report draft coordinates and endpoints when changing scope', async () => {
    await mount(); await calculate();
    const endpoints = rendered('Endpoint labels');
    fireEvent.click(screen.getByRole('button', { name: 'Segnala' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Pick start fixture' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Cosa hai trovato/ }), { target: { value: 'Draft fixture description' } });
    const draftPin = rendered('Draft pin');
    fireEvent.click(allToggle()); fireEvent.click(allToggle());
    expect(rendered('Draft pin')).toBe(draftPin);
    expect(rendered('Endpoint labels')).toBe(endpoints);
    expect((screen.getByRole('textbox', { name: /Cosa hai trovato/ }) as HTMLTextAreaElement).value).toBe('Draft fixture description');
  });
});
