// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { RouteResult } from '../shared/types.ts';
import { api } from '../src/api.ts';
import { useRoutePlanner } from '../src/hooks/useRoutePlanner.ts';

vi.mock('../src/api.ts', () => ({ api: { route: vi.fn() } }));

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

const origin = { lat: 43.72, lng: 10.4, label: 'Partenza' };
const destination = { lat: 43.721, lng: 10.401, label: 'Destinazione' };
const otherDestination = { lat: 43.722, lng: 10.402, label: 'Nuova destinazione' };
const mainRoute: RouteResult = { mode: 'wheelchair', provider: 'valhalla', coords: [[43.72, 10.4], [43.721, 10.401]], distanceM: 200, durationS: 180 };
const comparisonRoute: RouteResult = { ...mainRoute, mode: 'foot', distanceM: 150 };

function setup() {
  const onFocus = vi.fn();
  const hook = renderHook(() => useRoutePlanner({ onFocus }));
  act(() => { hook.result.current.changeFrom(origin); hook.result.current.changeTo(destination); });
  return { ...hook, onFocus };
}

function queueRequest() {
  const main = deferred<RouteResult>();
  const foot = deferred<RouteResult>();
  vi.mocked(api.route).mockReturnValueOnce(main.promise).mockReturnValueOnce(foot.promise);
  return { main, foot };
}

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe('useRoutePlanner request lifecycle', () => {
  it('shows the main route immediately and adds a late optional comparison without moving the map again', async () => {
    const { main, foot } = queueRequest();
    const { result, onFocus } = setup();
    act(() => { void result.current.calculate(); });
    expect(result.current.routeLoading).toBe(true);
    await act(async () => { main.resolve(mainRoute); });
    expect(result.current.route).toEqual(mainRoute);
    expect(result.current.routeLoading).toBe(false);
    expect(result.current.footRoute).toBeNull();
    expect(onFocus).toHaveBeenCalledWith(mainRoute.coords);
    await act(async () => { foot.resolve(comparisonRoute); });
    expect(result.current.footRoute).toEqual(comparisonRoute);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('keeps an early comparison hidden until the main route succeeds', async () => {
    const { main, foot } = queueRequest();
    const { result, onFocus } = setup();
    act(() => { void result.current.calculate(); });
    await act(async () => { foot.resolve(comparisonRoute); });
    expect(result.current.footRoute).toBeNull();
    expect(onFocus).not.toHaveBeenCalled();
    await act(async () => { main.resolve(mainRoute); });
    expect(result.current.footRoute).toEqual(comparisonRoute);
    expect(onFocus).toHaveBeenCalledWith([...mainRoute.coords, ...comparisonRoute.coords]);
  });

  it('aborts both requests on endpoint change and ignores late successes even if cancellation is ignored', async () => {
    const { main, foot } = queueRequest();
    const { result, onFocus } = setup();
    act(() => { void result.current.calculate(); });
    const mainSignal = vi.mocked(api.route).mock.calls[0][3];
    const footSignal = vi.mocked(api.route).mock.calls[1][3];
    act(() => result.current.changeTo(otherDestination));
    expect(mainSignal?.aborted).toBe(true);
    expect(footSignal?.aborted).toBe(true);
    expect(result.current.routeLoading).toBe(false);
    await act(async () => { main.resolve(mainRoute); foot.resolve(comparisonRoute); });
    expect(result.current.route).toBeNull();
    expect(result.current.footRoute).toBeNull();
    expect(result.current.routeError).toBeNull();
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('does not let a stale failure clear loading or replace the newer request', async () => {
    const old = queueRequest();
    const fresh = queueRequest();
    const { result } = setup();
    act(() => { void result.current.calculate(); });
    act(() => { result.current.changeTo(otherDestination); void result.current.calculate(); });
    expect(vi.mocked(api.route).mock.calls[2][1]).toEqual(otherDestination);
    await act(async () => { old.main.reject(new Error('Old request failed')); old.foot.resolve(comparisonRoute); });
    expect(result.current.routeLoading).toBe(true);
    expect(result.current.routeError).toBeNull();
    await act(async () => { fresh.main.resolve(mainRoute); fresh.foot.reject(new Error('Comparison unavailable')); });
    expect(result.current.route).toEqual(mainRoute);
    expect(result.current.footRoute).toBeNull();
    expect(result.current.routeError).toBeNull();
  });

  it('only publishes the latest calculation when a second request starts for the same endpoints', async () => {
    const old = queueRequest();
    const fresh = queueRequest();
    const { result, onFocus } = setup();
    act(() => { void result.current.calculate(); });
    const signal = vi.mocked(api.route).mock.calls[0][3];
    act(() => { void result.current.calculate(); });
    expect(signal?.aborted).toBe(true);
    const latestRoute = { ...mainRoute, distanceM: 220 };
    await act(async () => { fresh.main.resolve(latestRoute); fresh.foot.resolve(comparisonRoute); });
    await act(async () => { old.main.resolve(mainRoute); old.foot.resolve(comparisonRoute); });
    expect(result.current.route?.distanceM).toBe(220);
    expect(onFocus).toHaveBeenCalledTimes(1);
  });

  it('uses swapped endpoints immediately and drops the previous route', async () => {
    const old = queueRequest();
    const fresh = queueRequest();
    const { result } = setup();
    act(() => { void result.current.calculate(); });
    await act(async () => { old.main.resolve(mainRoute); });
    act(() => {
      const { from, to } = result.current;
      result.current.changeFrom(to);
      result.current.changeTo(from);
      void result.current.calculate();
    });
    expect(vi.mocked(api.route).mock.calls[2].slice(0, 2)).toEqual([destination, origin]);
    expect(result.current.route).toBeNull();
    await act(async () => { old.foot.resolve(comparisonRoute); });
    expect(result.current.footRoute).toBeNull();
    await act(async () => { fresh.main.resolve(mainRoute); fresh.foot.resolve(comparisonRoute); });
  });

  it('preserves a current main error and cancels its optional comparison', async () => {
    const { main, foot } = queueRequest();
    const { result, onFocus } = setup();
    act(() => { void result.current.calculate(); });
    const signal = vi.mocked(api.route).mock.calls[1][3];
    await act(async () => { main.reject(new Error('Nessun percorso disponibile.')); });
    expect(result.current.routeError).toBe('Nessun percorso disponibile.');
    expect(result.current.routeLoading).toBe(false);
    expect(signal?.aborted).toBe(true);
    await act(async () => { foot.resolve(comparisonRoute); });
    expect(result.current.footRoute).toBeNull();
    expect(onFocus).not.toHaveBeenCalled();
  });

  it('aborts on unmount and never focuses the map from an unmounted request', async () => {
    const { main, foot } = queueRequest();
    const { result, unmount, onFocus } = setup();
    act(() => { void result.current.calculate(); });
    const signal = vi.mocked(api.route).mock.calls[0][3];
    unmount();
    expect(signal?.aborted).toBe(true);
    await act(async () => { main.resolve(mainRoute); foot.resolve(comparisonRoute); });
    expect(onFocus).not.toHaveBeenCalled();
  });
});
