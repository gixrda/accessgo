// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useVoiceNavigation } from '../src/hooks/useVoiceNavigation.ts';
import { maneuverInstruction, navigationGeometry, projectNavigationPosition, usableManeuvers, type NavigationRoute } from '../src/lib/navigation.ts';
import type { LatLngTuple } from '../shared/types.ts';

const origin: LatLngTuple = [43.72, 10.4];
const at = (m: number): LatLngTuple => [origin[0] + m / (Math.PI * 6_371_000 / 180), origin[1]];
const route: NavigationRoute = {
  mode: 'wheelchair', distanceM: 300, coords: [at(0), at(100), at(200), at(300)],
  maneuvers: [
    { instruction: 'Procedi verso nord.', coordinate: at(0), shapeIndex: 0, routeDistanceM: 0, distanceM: 200, legIndex: 0, type: 'depart' },
    { instruction: 'Gira a destra.', coordinate: at(200), shapeIndex: 2, routeDistanceM: 200, distanceM: 100, legIndex: 0, type: 'turn' },
    { instruction: 'Sei arrivato a destinazione.', coordinate: at(300), shapeIndex: 3, routeDistanceM: 300, distanceM: 0, legIndex: 0, type: 'arrive' },
  ],
};

const voiceMock = vi.hoisted(() => ({
  supported: true, configured: true, checking: false, loading: false, error: null,
  speak: vi.fn(), cancel: vi.fn(), reset: vi.fn(), activate: vi.fn(),
}));
vi.mock('../src/hooks/useElevenLabsVoice.ts', () => ({ useElevenLabsVoice: () => voiceMock }));

let positionCallback: PositionCallback;
let errorCallback: PositionErrorCallback | null;
let watchPosition: ReturnType<typeof vi.fn>;
let clearWatch: ReturnType<typeof vi.fn>;
let speak: ReturnType<typeof vi.fn>;
let cancel: ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(1_000_000);
  watchPosition = vi.fn((success, error) => { positionCallback = success; errorCallback = error; return 42; });
  clearWatch = vi.fn();
  Object.assign(voiceMock, { supported: true, configured: true });
  vi.clearAllMocks();
  speak = voiceMock.speak; cancel = voiceMock.cancel;
  vi.stubGlobal('isSecureContext', true);
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { watchPosition, clearWatch } });
});
afterEach(() => { cleanup(); vi.restoreAllMocks(); vi.unstubAllGlobals(); vi.useRealTimers(); });

function position(meters: number, accuracy = 5, age = 0, longitude = origin[1]) {
  const coordinate = at(meters);
  act(() => {
    vi.advanceTimersByTime(5000);
    positionCallback({ coords: { latitude: coordinate[0], longitude, accuracy }, timestamp: Date.now() - age } as GeolocationPosition);
  });
}
const spoken = () => speak.mock.calls.map(([text]) => text as string);

describe('conservative route position projection', () => {
  it('uses cumulative metre progress and refuses stale or low precision fixes', () => {
    const geometry = navigationGeometry(route.coords)!;
    const fix = { coordinate: at(10), accuracyM: 5, timestamp: Date.now() };
    const result = projectNavigationPosition(geometry, fix, null);
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.progress.distanceM).toBeCloseTo(10, 1);
    expect(projectNavigationPosition(geometry, { ...fix, accuracyM: 70 }, null).status).toBe('imprecise');
    expect(projectNavigationPosition(geometry, { ...fix, timestamp: Date.now() - 20_000 }, null).status).toBe('stale');
  });

  it('requires proximity to the start and does not teleport to distant route segments', () => {
    const geometry = navigationGeometry(route.coords)!;
    const fix = { coordinate: at(150), accuracyM: 5, timestamp: Date.now() };
    expect(projectNavigationPosition(geometry, fix, null).status).toBe('start');
    const previous = { distanceM: 0, segmentIndex: 0, timestamp: Date.now() - 5000 };
    expect(projectNavigationPosition(geometry, fix, previous).status).toBe('off-route');
  });

  it('does not jump to the finish when the route loops back to the starting street', () => {
    const loop = navigationGeometry([at(0), at(300), [at(300)[0], 10.401], [at(0)[0], 10.401], at(0)])!;
    const fix = { coordinate: at(0), accuracyM: 8, timestamp: Date.now() };
    const result = projectNavigationPosition(loop, fix, { distanceM: 5, segmentIndex: 0, timestamp: Date.now() - 5000 });
    expect(result.status).toBe('ready');
    if (result.status === 'ready') expect(result.progress.distanceM).toBe(5);
  });

  it('rejects fabricated or invalid maneuver positions and standard pedestrian fallback', () => {
    expect(usableManeuvers({ ...route, mode: 'foot_fallback' })).toEqual([]);
    expect(usableManeuvers({ ...route, maneuvers: [{ ...route.maneuvers![1], shapeIndex: 200 }] })).toEqual([]);
    expect(usableManeuvers({ ...route, maneuvers: [] })).toEqual([]);
  });
});

describe('foreground Italian speech navigation', () => {
  it.each(['blocked', 'unavailable'] as const)('does not speak previews or start GPS for a %s route', (status) => {
    const value: NavigationRoute = { ...route, safety: { status, message: 'Route blocked fixture', blockedBy: [], avoided: [], reportsChecked: true } };
    expect(usableManeuvers(value)).toEqual([]);
    const { result } = renderHook(() => useVoiceNavigation(value));
    act(() => { result.current.testVoice(); result.current.preview(); result.current.preview(1); result.current.start(); });
    expect(watchPosition).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    expect(result.current.available).toBe(false);
  });

  it('uses explicit speech previews without GPS and no spontaneous speech on mount', () => {
    const { result } = renderHook(() => useVoiceNavigation(route));
    expect(watchPosition).not.toHaveBeenCalled();
    expect(speak).not.toHaveBeenCalled();
    act(() => result.current.testVoice());
    act(() => result.current.preview());
    act(() => result.current.preview(1));
    expect(watchPosition).not.toHaveBeenCalled();
    expect(spoken()[1]).toContain('Anteprima');
    expect(spoken()[1]).toContain('Procedi verso nord.');
    expect(spoken()[2]).toContain('Anteprima dell’indicazione: Gira a destra.');
  });

  it('announces the real turn around 100m and near the turn once each', () => {
    const onPosition = vi.fn();
    const { result } = renderHook(() => useVoiceNavigation(route, onPosition));
    act(() => result.current.start());
    act(() => result.current.start());
    expect(watchPosition).toHaveBeenCalledOnce();
    position(0); position(35); position(70); position(100); position(110); position(140); position(170); position(185); position(190);
    expect(spoken().filter((text) => text.includes('Tra circa 100 metri: Gira a destra.'))).toHaveLength(1);
    expect(spoken().filter((text) => text === 'Gira a destra.')).toHaveLength(1);
    expect(onPosition).toHaveBeenCalled();
    expect(result.current.active).toBe(true);
  });

  it('does not issue turns on imprecise, stale or off-route GPS fixes', () => {
    const { result } = renderHook(() => useVoiceNavigation(route));
    act(() => result.current.start()); position(0);
    const before = speak.mock.calls.length;
    position(100, 90); expect(result.current.readyPosition).toBe(false);
    position(100, 5, 30_000); expect(result.current.status).toContain('non aggiornata');
    position(100, 5, 0, 10.405); expect(result.current.status).toContain('fuori percorso');
    expect(speak).toHaveBeenCalledTimes(before);
  });

  it('keeps a turn current until passed, even when the following turn is only nine metres away', () => {
    const closeTurns: NavigationRoute = {
      ...route, coords: [at(0), at(200), at(209), at(300)], maneuvers: [
        { ...route.maneuvers![0], shapeIndex: 0 },
        { ...route.maneuvers![1], shapeIndex: 1 },
        { ...route.maneuvers![1], instruction: 'Gira a sinistra.', routeDistanceM: 209, coordinate: at(209), shapeIndex: 2 },
        { ...route.maneuvers![2], shapeIndex: 3 },
      ],
    };
    const { result } = renderHook(() => useVoiceNavigation(closeTurns));
    act(() => result.current.start());
    position(0); position(35); position(70); position(100); position(130); position(160); position(185); position(195);
    expect(spoken().filter((text) => text === 'Gira a destra.')).toHaveLength(1);
    expect(spoken().filter((text) => text === 'Gira a sinistra.')).toHaveLength(0);
    expect(result.current.upcoming?.instruction).toBe('Gira a destra.');
    const canceledBeforePassing = cancel.mock.calls.length;
    position(206);
    expect(cancel.mock.calls.length).toBeGreaterThan(canceledBeforePassing);
    expect(spoken().filter((text) => text === 'Gira a sinistra.')).toHaveLength(1);
  });

  it('identifies intermediate arrival as a stop and keeps the trip active', () => {
    const stops: NavigationRoute = {
      ...route, maneuvers: [
        route.maneuvers![0],
        { ...route.maneuvers![1], type: 'arrive', instruction: 'La tua destinazione si trova a destra.' },
        { ...route.maneuvers![1], type: 'depart', legIndex: 1, instruction: 'Continua verso nord.' },
        { ...route.maneuvers![2], legIndex: 1 },
      ],
    };
    expect(maneuverInstruction(stops.maneuvers!, 1)).toContain('Tappa B');
    const { result } = renderHook(() => useVoiceNavigation(stops));
    act(() => result.current.start());
    position(0); position(35); position(70); position(100); position(130); position(160); position(185);
    expect(spoken().some((text) => text.startsWith('Tappa B:'))).toBe(true);
    expect(result.current.active).toBe(true);
    expect(result.current.arrived).toBe(false);
  });

  it('pauses GPS readiness if updates stop arriving', () => {
    const { result } = renderHook(() => useVoiceNavigation(route));
    act(() => result.current.start()); position(0);
    act(() => vi.advanceTimersByTime(20_000));
    expect(result.current.readyPosition).toBe(false);
    expect(result.current.status).toContain('non aggiornata');
  });

  it('stops with helpful text after denied location permission', () => {
    const { result } = renderHook(() => useVoiceNavigation(route));
    act(() => result.current.start());
    act(() => errorCallback?.({ code: 1 } as GeolocationPositionError));
    expect(result.current.active).toBe(false);
    expect(result.current.status).toContain('Posizione non autorizzata');
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it('only announces arrival with fresh, precise coordinates at the actual endpoint', () => {
    const { result } = renderHook(() => useVoiceNavigation(route));
    act(() => result.current.start());
    position(0); position(35); position(70); position(100); position(130); position(160); position(190); position(220); position(250);
    position(280, 60);
    expect(result.current.arrived).toBe(false);
    position(280); position(295);
    expect(result.current.arrived).toBe(true);
    expect(result.current.active).toBe(false);
    expect(spoken().filter((text) => text === 'Sei arrivato a destinazione.')).toHaveLength(1);
    expect(clearWatch).toHaveBeenCalledWith(42);
  });

  it('cleans up speech and GPS when route changes, and ignores late callbacks', () => {
    const onPosition = vi.fn();
    const { result, rerender, unmount } = renderHook(({ route }) => useVoiceNavigation(route, onPosition), { initialProps: { route } });
    act(() => result.current.start()); position(0);
    const oldCallback = positionCallback;
    const next = { ...route, coords: [...route.coords] };
    rerender({ route: next });
    expect(result.current.active).toBe(false);
    expect(clearWatch).toHaveBeenCalledWith(42);
    const before = onPosition.mock.calls.length;
    act(() => oldCallback({ coords: { latitude: at(10)[0], longitude: origin[1], accuracy: 5 }, timestamp: Date.now() + 1000 } as GeolocationPosition));
    expect(onPosition).toHaveBeenCalledTimes(before);
    act(() => result.current.start());
    unmount();
    expect(clearWatch).toHaveBeenCalledTimes(2);
  });

  it('stops on backgrounding and requires another explicit start', () => {
    const { result } = renderHook(() => useVoiceNavigation(route));
    act(() => result.current.start());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.active).toBe(false);
    expect(result.current.status).toContain('Guida in pausa');
    expect(clearWatch).toHaveBeenCalledWith(42);
    expect(watchPosition).toHaveBeenCalledOnce();
  });

  it('does not start GPS for foot fallback, missing directions, or unavailable speech', () => {
    const fallback = { ...route, mode: 'foot_fallback' as const };
    const { result, rerender } = renderHook(({ value }) => useVoiceNavigation(value), { initialProps: { value: fallback as NavigationRoute } });
    act(() => result.current.start());
    expect(watchPosition).not.toHaveBeenCalled();
    rerender({ value: { ...route, maneuvers: [] } });
    act(() => result.current.start());
    expect(watchPosition).not.toHaveBeenCalled();
    voiceMock.supported = false;
    rerender({ value: route });
    act(() => result.current.start());
    expect(watchPosition).not.toHaveBeenCalled();
  });
});
