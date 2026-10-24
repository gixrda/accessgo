// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App.tsx';
import { api } from '../src/api.ts';
import type { RouteIntent } from '../shared/routeIntent.ts';
import type { RouteResult } from '../shared/types.ts';
import type { Place, ViaStop } from '../src/hooks/useRoutePlanner.ts';

vi.mock('../src/api.ts', () => ({
  api: { status: vi.fn(), osm: vi.fn(), reports: vi.fn(), route: vi.fn(), geocode: vi.fn(), interpretRoute: vi.fn() },
}));
vi.mock('../src/lib/voiceApi.ts', () => ({
  getVoiceStatus: vi.fn(async () => ({ provider: 'elevenlabs', configured: false, sttModel: 'scribe_v2', ttsModel: 'eleven_multilingual_v2' })),
  requestVoiceAudio: vi.fn(), transcribeAudio: vi.fn(),
}));

// Keep App, VoiceRoutePanel, candidate confirmation, geolocation coordination and route hook real.
// Replace only Leaflet with an observable map state and map-pick controls.
vi.mock('../src/components/MapView.tsx', () => ({
  MapView: (props: {
    from: Place | null; to: Place | null; via: ViaStop[]; route: RouteResult | null;
    userPos: { lat: number; lng: number } | null; focus: unknown;
    onPick: (point: { lat: number; lng: number }) => void;
  }) => <div>
    <output aria-label="Map itinerary">{JSON.stringify({ from: props.from, to: props.to, via: props.via.map((stop) => stop.place) })}</output>
    <output aria-label="Map route">{JSON.stringify(props.route)}</output>
    <output aria-label="Map user position">{JSON.stringify(props.userPos)}</output>
    <output aria-label="Map focus">{JSON.stringify(props.focus)}</output>
    <button onClick={() => props.onPick(manualFrom)}>Pick old origin</button>
    <button onClick={() => props.onPick(manualVia)}>Pick old stop</button>
    <button onClick={() => props.onPick(manualTo)}>Pick old destination</button>
  </div>,
}));

const manualFrom = { lat: 43.716, lng: 10.402 };
const manualVia = { lat: 43.718, lng: 10.403 };
const manualTo = { lat: 43.72, lng: 10.404 };
const confirmed = {
  from: { lat: 43.7088, lng: 10.3988, label: 'Pisa Centrale · confirmed origin' },
  via: [{ lat: 43.7165, lng: 10.4018, label: 'Piazza Garibaldi · confirmed stop' }],
  to: { lat: 43.723, lng: 10.3966, label: 'Torre di Pisa · confirmed destination' },
};
const utterance = 'Da Pisa Centrale alla Torre di Pisa passando per Piazza Garibaldi';
const interpretation: RouteIntent = {
  intent: 'route', origin: { query: 'Pisa Centrale', evidence: 'Pisa Centrale' },
  destination: { query: 'Torre di Pisa', evidence: 'Torre di Pisa' },
  via: [{ query: 'Piazza Garibaldi', evidence: 'Piazza Garibaldi' }],
  useCurrentLocation: false, clarification: null, engine: 'gemma', model: 'test-model',
};
const plannedRoute: RouteResult = {
  mode: 'wheelchair', provider: 'valhalla', distanceM: 1800, durationS: 1600,
  coords: [confirmed.from, confirmed.via[0], confirmed.to].map(({ lat, lng }) => [lat, lng]),
};
let geoSuccess: PositionCallback;
let geoFailure: PositionErrorCallback;
let getCurrentPosition: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date('2026-10-24T14:00:00Z'));
  vi.clearAllMocks();
  window.sessionStorage.clear();
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ matches: false, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.stubGlobal('isSecureContext', true);
  getCurrentPosition = vi.fn((success, failure) => { geoSuccess = success; geoFailure = failure; });
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition, clearWatch: vi.fn() } });
  vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'gemma-google', admin: false });
  vi.mocked(api.osm).mockResolvedValue({ source: 'test fixture', fetchedAt: '', bbox: [43.7, 10.3, 43.8, 10.5], features: [] });
  vi.mocked(api.reports).mockResolvedValue([]);
  vi.mocked(api.interpretRoute).mockResolvedValue(interpretation);
  vi.mocked(api.geocode).mockImplementation(async (query) => ({
    'Pisa Centrale': [confirmed.from], 'Piazza Garibaldi': confirmed.via, 'Torre di Pisa': [confirmed.to],
  })[query] ?? []);
  vi.mocked(api.route).mockImplementation(async (_from, _to, profile) => ({ ...plannedRoute, mode: profile }));
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

const mapItinerary = () => JSON.parse(screen.getByLabelText('Map itinerary').textContent!);

async function chooseManualSearchedOrigin() {
  const form = screen.getByRole('search', { name: 'Cerca partenza' });
  fireEvent.change(within(form).getByRole('searchbox'), { target: { value: 'Pisa Centrale' } });
  await act(async () => fireEvent.submit(form));
  fireEvent.click(screen.getByRole('button', { name: confirmed.from.label }));
  expect(mapItinerary().from).toEqual(confirmed.from);
}

async function mountWithOldManualPoints(pendingLocation = false) {
  await act(async () => { render(<App />); });
  if (pendingLocation) fireEvent.click(screen.getByRole('button', { name: 'La mia posizione' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Scegli sulla mappa' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Pick old origin' }));
  fireEvent.click(screen.getByRole('button', { name: '+ Aggiungi tappa' }));
  fireEvent.click(screen.getAllByRole('button', { name: 'Scegli sulla mappa' })[0]);
  fireEvent.click(screen.getByRole('button', { name: 'Pick old stop' }));
  fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Pick old destination' }));
  expect(mapItinerary()).toMatchObject({ from: manualFrom, via: [manualVia], to: manualTo });
}

async function prepareAndChooseVoicePoints() {
  fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca un luogo o chiedi un percorso' }), { target: { value: utterance } });
  await act(async () => fireEvent.submit(screen.getByRole('search', { name: 'Cerca luoghi e percorsi' })));
  await act(async () => { await vi.runAllTimersAsync(); });
  expect(api.route).not.toHaveBeenCalled();
  fireEvent.change(screen.getByRole('combobox', { name: 'Scegli partenza' }), { target: { value: '0' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scegli tappa 1' }), { target: { value: '0' } });
  fireEvent.change(screen.getByRole('combobox', { name: 'Scegli destinazione' }), { target: { value: '0' } });
  expect(api.route).not.toHaveBeenCalled();
}

describe('confirmed voice itinerary through the actual App', () => {
  it('ignores an unfinished interpretation after the top search text is edited', async () => {
    await mountWithOldManualPoints();
    let finishInterpretation!: (intent: RouteIntent) => void;
    vi.mocked(api.interpretRoute).mockReturnValueOnce(new Promise((resolve) => { finishInterpretation = resolve; }));
    const input = screen.getByRole('searchbox', { name: 'Cerca un luogo o chiedi un percorso' });
    fireEvent.change(input, { target: { value: utterance } });
    await act(async () => fireEvent.submit(screen.getByRole('search', { name: 'Cerca luoghi e percorsi' })));
    expect(api.interpretRoute).toHaveBeenCalledOnce();
    const signal = vi.mocked(api.interpretRoute).mock.calls[0][1];
    fireEvent.change(input, { target: { value: 'Sto scrivendo una nuova richiesta' } });
    expect(signal?.aborted).toBe(true);
    await act(async () => {
      finishInterpretation(interpretation);
      await vi.runAllTimersAsync();
    });
    expect(api.geocode).not.toHaveBeenCalled();
    expect(api.route).not.toHaveBeenCalled();
    expect(screen.queryByRole('combobox', { name: 'Scegli partenza' })).toBeNull();
    expect(mapItinerary()).toMatchObject({ from: manualFrom, to: manualTo, via: [manualVia] });
  });

  it('does not overwrite a newly searched manual origin with an earlier GPS result', async () => {
    await act(async () => { render(<App />); });
    fireEvent.click(screen.getByRole('button', { name: 'La mia posizione', exact: true }));
    await chooseManualSearchedOrigin();
    await act(async () => geoSuccess({
      coords: { latitude: 43.71, longitude: 10.41, accuracy: 15 }, timestamp: Date.now(),
    } as GeolocationPosition));
    expect(mapItinerary().from).toEqual(confirmed.from);
    expect(screen.getByLabelText('Map user position').textContent).toBe('null');
  });

  it('dismisses an old approximate-position confirmation when a manual origin is selected', async () => {
    await act(async () => { render(<App />); });
    fireEvent.click(screen.getByRole('button', { name: 'La mia posizione', exact: true }));
    await act(async () => geoSuccess({
      coords: { latitude: 43.71, longitude: 10.41, accuracy: 400 }, timestamp: Date.now(),
    } as GeolocationPosition));
    expect(screen.getByRole('button', { name: 'Conferma questa posizione' })).toBeTruthy();
    await chooseManualSearchedOrigin();
    expect(screen.queryByRole('button', { name: 'Conferma questa posizione' })).toBeNull();
    expect(mapItinerary().from).toEqual(confirmed.from);
  });

  it('ignores a route-location result after switching to the report section', async () => {
    await act(async () => { render(<App />); });
    fireEvent.click(screen.getByRole('button', { name: 'La mia posizione', exact: true }));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Segnala', exact: true })));
    await act(async () => geoSuccess({
      coords: { latitude: 43.71, longitude: 10.41, accuracy: 15 }, timestamp: Date.now(),
    } as GeolocationPosition));
    expect(mapItinerary().from).toBeNull();
    expect(screen.getByLabelText('Map user position').textContent).toBe('null');
    expect(screen.getByLabelText('Map focus').textContent).toBe('null');
  });

  it('calculates both profiles with the freshly confirmed endpoints and ordered stops, never the previous manual state', async () => {
    await mountWithOldManualPoints();
    await prepareAndChooseVoicePoints();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' })));
    expect(api.route).toHaveBeenCalledTimes(2);
    expect(api.route).toHaveBeenNthCalledWith(1, confirmed.from, confirmed.to, 'wheelchair', expect.any(AbortSignal), confirmed.via);
    expect(api.route).toHaveBeenNthCalledWith(2, confirmed.from, confirmed.to, 'foot', expect.any(AbortSignal), confirmed.via);
    expect(mapItinerary()).toEqual(confirmed);
    expect(JSON.parse(screen.getByLabelText('Map route').textContent!)).toMatchObject(plannedRoute);
    expect(screen.getByRole('heading', { name: 'Percorso impostato' })).toBeTruthy();
  });

  it('accepts consecutive top-search requests and does not replay the consumed request after changing sections', async () => {
    await mountWithOldManualPoints();
    await prepareAndChooseVoicePoints();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' })));

    const secondText = 'Da Torre di Pisa a Pisa Centrale';
    vi.mocked(api.interpretRoute).mockResolvedValueOnce({
      ...interpretation, origin: interpretation.destination, destination: interpretation.origin, via: [],
    });
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca un luogo o chiedi un percorso' }), { target: { value: secondText } });
    await act(async () => fireEvent.submit(screen.getByRole('search', { name: 'Cerca luoghi e percorsi' })));
    await act(async () => { await vi.runAllTimersAsync(); });

    expect(api.interpretRoute).toHaveBeenCalledTimes(2);
    expect(api.interpretRoute).toHaveBeenNthCalledWith(1, utterance, expect.any(AbortSignal));
    expect(api.interpretRoute).toHaveBeenNthCalledWith(2, secondText, expect.any(AbortSignal));
    expect(api.route).toHaveBeenCalledTimes(2);
    expect(screen.queryByRole('combobox', { name: 'Scegli tappa 1' })).toBeNull();
    fireEvent.change(screen.getByRole('combobox', { name: 'Scegli partenza' }), { target: { value: '0' } });
    fireEvent.change(screen.getByRole('combobox', { name: 'Scegli destinazione' }), { target: { value: '0' } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' })));

    expect(api.route).toHaveBeenCalledTimes(4);
    expect(api.route).toHaveBeenNthCalledWith(3, confirmed.to, confirmed.from, 'wheelchair', expect.any(AbortSignal), []);
    expect(mapItinerary()).toEqual({ from: confirmed.to, to: confirmed.from, via: [] });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Segnala', exact: true })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Percorso', exact: true })));
    await act(async () => { await vi.runAllTimersAsync(); });
    expect(api.interpretRoute).toHaveBeenCalledTimes(2);
    expect(api.geocode).toHaveBeenCalledTimes(5);
    expect(api.route).toHaveBeenCalledTimes(4);
    expect(mapItinerary()).toEqual({ from: confirmed.to, to: confirmed.from, via: [] });
  });

  it.each(['success', 'failure'] as const)('ignores stale manual geolocation %s after voice confirmation', async (outcome) => {
    await mountWithOldManualPoints(true);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    await prepareAndChooseVoicePoints();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' })));
    const focus = screen.getByLabelText('Map focus').textContent;
    await act(async () => {
      if (outcome === 'success') geoSuccess({ coords: { latitude: 43.71, longitude: 10.41, accuracy: 15 }, timestamp: Date.now() } as GeolocationPosition);
      else geoFailure({ code: 1, PERMISSION_DENIED: 1 } as GeolocationPositionError);
    });
    expect(mapItinerary()).toEqual(confirmed);
    expect(JSON.parse(screen.getByLabelText('Map route').textContent!)).toMatchObject(plannedRoute);
    expect(screen.getByLabelText('Map user position').textContent).toBe('null');
    expect(screen.getByLabelText('Map focus').textContent).toBe(focus);
    expect(screen.queryByText(/Permesso di geolocalizzazione negato/)).toBeNull();
    expect(api.route).toHaveBeenCalledTimes(2);
  });
});
