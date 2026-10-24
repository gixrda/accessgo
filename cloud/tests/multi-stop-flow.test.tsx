// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';
import { api } from '../src/api.ts';
import type { PickMode } from '../src/components/MapView.tsx';
import type { Place, ViaStop } from '../src/hooks/useRoutePlanner.ts';

vi.mock('../src/api.ts', () => ({ api: { status: vi.fn(), osm: vi.fn(), reports: vi.fn(), route: vi.fn(), geocode: vi.fn() } }));
vi.mock('../src/components/MapView.tsx', () => ({ MapView: (p: {
  from: Place | null; to: Place | null; via: ViaStop[]; pickMode: PickMode;
  onPick: (point: {lat: number; lng: number}) => void;
}) => <div>
  <output aria-label="Itinerary">{[p.from, ...p.via.map((stop) => stop.place), p.to].map((place) => place?.lat ?? '-').join(',')}</output>
  <button onClick={() => p.pickMode && p.onPick({ lat: 43.72, lng: 10.4 })}>Pick A</button>
  <button onClick={() => p.pickMode && p.onPick({ lat: 43.721, lng: 10.401 })}>Pick B</button>
  <button onClick={() => p.pickMode && p.onPick({ lat: 43.722, lng: 10.402 })}>Pick C</button>
</div> }));

beforeEach(() => {
  vi.resetAllMocks(); window.sessionStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'fallback', admin: false });
  vi.mocked(api.osm).mockResolvedValue({ source: 'test fixture', fetchedAt: '', bbox: [43.7,10.3,43.8,10.5], features: [] });
  vi.mocked(api.reports).mockResolvedValue([]);
  vi.mocked(api.route).mockResolvedValue({mode:'wheelchair', provider:'valhalla', coords:[[43.72,10.4],[43.721,10.401],[43.722,10.402]], distanceM:300, durationS:250});
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

it('adds, fills and routes A→B→C; deleting or reversing updates the full itinerary', async () => {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi tappa' }));
  expect(screen.getByRole('searchbox', {name:'Tappa 1'})).toBeTruthy();
  expect((screen.getByRole('button', {name:'Calcola percorso'}) as HTMLButtonElement).disabled).toBe(true);
  fireEvent.click(screen.getAllByRole('button', {name:'Scegli sulla mappa'})[0]);
  fireEvent.click(screen.getByRole('button', {name:'Pick A'}));
  fireEvent.click(screen.getAllByRole('button', {name:'Scegli sulla mappa'})[0]);
  fireEvent.click(screen.getByRole('button', {name:'Pick B'}));
  fireEvent.click(screen.getByRole('button', {name:'Scegli sulla mappa'}));
  fireEvent.click(screen.getByRole('button', {name:'Pick C'}));
  expect(screen.getByLabelText('Itinerary').textContent).toBe('43.72,43.721,43.722');
  await act(async () => fireEvent.click(screen.getByRole('button', {name:'Calcola percorso'})));
  const [a,c,profile,,via] = vi.mocked(api.route).mock.calls[0];
  expect(a.lat).toBe(43.72); expect(c.lat).toBe(43.722); expect(profile).toBe('wheelchair');
  expect(via?.map((point) => point.lat)).toEqual([43.721]);
  const manual = screen.getByText('Modifica le tappe').closest('details')!;
  const data = screen.getByText('Dati e confronto percorsi').closest('details')!;
  expect(manual.open).toBe(false);
  expect(data.open).toBe(false);
  fireEvent.click(screen.getByText('Dati e confronto percorsi'));
  expect(data.open).toBe(true);
  fireEvent.click(screen.getByText('Modifica le tappe'));
  expect(manual.open).toBe(true);
  fireEvent.click(await screen.findByRole('button', {name:'Inverti partenza e destinazione'}));
  expect(screen.getByLabelText('Itinerary').textContent).toBe('43.722,43.721,43.72');
  fireEvent.click(screen.getByRole('button', {name:'Elimina tappa 1'}));
  expect(screen.getByLabelText('Itinerary').textContent).toBe('43.722,43.72');
  expect(screen.queryByRole('searchbox', {name:'Tappa 1'})).toBeNull();
});

it('retains independent search inputs when removing another stop', async () => {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole('button', {name:'+ Aggiungi tappa'}));
  fireEvent.click(screen.getByRole('button', {name:'+ Aggiungi tappa'}));
  fireEvent.change(screen.getByRole('searchbox', {name:'Tappa 2'}), {target:{value:'Piazza dei Cavalieri'}});
  fireEvent.click(screen.getByRole('button', {name:'Elimina tappa 1'}));
  expect((screen.getByRole('searchbox', {name:'Tappa 1'}) as HTMLInputElement).value).toBe('Piazza dei Cavalieri');
  expect(screen.queryByRole('searchbox', {name:'Tappa 2'})).toBeNull();
});
