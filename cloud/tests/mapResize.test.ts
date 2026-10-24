// @vitest-environment jsdom
import L from 'leaflet';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { observeMapSize } from '../src/lib/mapResize.ts';

describe('mobile map resizing', () => {
  let container: HTMLDivElement;
  let map: L.Map;
  let width: number;
  let height: number;
  let cleanup: (() => void) | undefined;
  let resize: () => void;
  let frames: Map<number, FrameRequestCallback>;
  let disconnect: ReturnType<typeof vi.fn>;

  const flushFrame = () => {
    const pending = [...frames.values()];
    frames.clear();
    pending.forEach((callback) => callback(0));
  };

  beforeEach(() => {
    width = 390;
    height = 300;
    frames = new Map();
    let id = 0;
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++id, callback);
      return id;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((frame) => { frames.delete(frame); });
    disconnect = vi.fn();
    vi.stubGlobal('ResizeObserver', class {
      constructor(callback: () => void) { resize = callback; }
      observe = vi.fn();
      disconnect = disconnect;
    });
    container = document.createElement('div');
    Object.defineProperties(container, {
      clientWidth: { get: () => width },
      clientHeight: { get: () => height },
    });
    document.body.append(container);
    map = L.map(container, { zoomControl: false, attributionControl: false, trackResize: false })
      .setView([43.7175, 10.4005], 16);
  });

  afterEach(() => {
    cleanup?.();
    cleanup = undefined;
    map.remove();
    container.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('refreshes Leaflet when a collapsed sheet exposes more map, retaining centre and zoom', () => {
    cleanup = observeMapSize(map);
    flushFrame();
    const centre = map.getCenter();
    height = 700;
    resize();
    flushFrame();
    expect(map.getSize()).toEqual(L.point(390, 700));
    // Leaflet rounds its pixel origin, so allow less than one pixel at this zoom.
    expect(map.getCenter().distanceTo(centre)).toBeLessThan(2);
    expect(map.getZoom()).toBe(16);
  });

  it('coalesces resize notifications, skips unchanged and zero-sized containers, then recovers', () => {
    const invalidate = vi.spyOn(map, 'invalidateSize');
    cleanup = observeMapSize(map);
    resize();
    resize();
    flushFrame();
    expect(invalidate).toHaveBeenCalledTimes(1);
    resize();
    flushFrame();
    expect(invalidate).toHaveBeenCalledTimes(1);
    height = 0;
    resize();
    flushFrame();
    expect(invalidate).toHaveBeenCalledTimes(1);
    width = 844;
    height = 170;
    resize();
    flushFrame();
    expect(map.getSize()).toEqual(L.point(844, 170));
    expect(invalidate).toHaveBeenCalledTimes(2);
  });

  it('disconnects observation and cancels queued work on unmount', () => {
    const invalidate = vi.spyOn(map, 'invalidateSize');
    cleanup = observeMapSize(map);
    cleanup();
    cleanup = undefined;
    resize();
    flushFrame();
    expect(disconnect).toHaveBeenCalledOnce();
    expect(invalidate).not.toHaveBeenCalled();
  });

  it('handles and cleans up the window resize fallback when ResizeObserver is unavailable', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    cleanup = observeMapSize(map);
    flushFrame();
    height = 600;
    window.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(map.getSize().y).toBe(600);
    cleanup();
    cleanup = undefined;
    height = 200;
    window.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(map.getSize().y).toBe(600);
  });
});
