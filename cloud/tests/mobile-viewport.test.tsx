// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useAppViewport } from '../src/hooks/useMobileLayout.ts';

class TestViewport extends EventTarget {
  height = 844;
  offsetTop = 0;
  scale = 1;
}

describe('keyboard viewport lifecycle', () => {
  let viewport: TestViewport;
  let input: HTMLInputElement;
  let frames: Map<number, FrameRequestCallback>;
  let mobile: boolean;

  function flushFrame() {
    act(() => {
      const pending = [...frames.values()];
      frames.clear();
      pending.forEach((callback) => callback(0));
    });
  }

  function changeViewport(height: number, offsetTop = 0, event = 'resize') {
    viewport.height = height;
    viewport.offsetTop = offsetTop;
    viewport.dispatchEvent(new Event(event));
    flushFrame();
  }

  beforeEach(() => {
    vi.useFakeTimers();
    viewport = new TestViewport();
    frames = new Map();
    mobile = true;
    let frameId = 0;
    vi.stubGlobal('visualViewport', viewport);
    vi.stubGlobal('innerHeight', 844);
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: mobile })));
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(844);
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      frames.set(++frameId, callback);
      return frameId;
    });
    vi.spyOn(window, 'cancelAnimationFrame').mockImplementation((id) => { frames.delete(id); });
    input = document.createElement('input');
    input.type = 'search';
    document.body.append(input);
  });

  afterEach(() => {
    cleanup();
    input.remove();
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it('follows a keyboard pan reported only by visualViewport.scroll and coalesces notifications', () => {
    const { result } = renderHook(useAppViewport);
    expect(result.current).toEqual({ height: 844, top: 0, keyboardOpen: false });
    input.focus();
    viewport.height = 410;
    viewport.offsetTop = 120;
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    expect(frames.size).toBe(1);
    flushFrame();
    expect(result.current).toEqual({ height: 410, top: 120, keyboardOpen: true });
    changeViewport(410, 170, 'scroll');
    expect(result.current.top).toBe(170);
  });

  it('recovers through repeated keyboard cycles, including dismissal without blur', () => {
    const { result } = renderHook(useAppViewport);
    input.focus();
    for (let cycle = 0; cycle < 3; cycle++) {
      changeViewport(410, 120);
      expect(result.current.keyboardOpen).toBe(true);
      changeViewport(844);
      expect(result.current).toEqual({ height: 844, top: 0, keyboardOpen: false });
      expect(document.activeElement).toBe(input);
    }
  });

  it('keeps the compact layout when blur precedes the keyboard closing animation', () => {
    const { result } = renderHook(useAppViewport);
    input.focus();
    changeViewport(410, 100);
    input.blur();
    flushFrame();
    expect(result.current.keyboardOpen).toBe(true);
    changeViewport(844);
    expect(result.current.keyboardOpen).toBe(false);
  });

  it('does not reflow or follow panning during pinch zoom, then resumes at normal scale', () => {
    const { result } = renderHook(useAppViewport);
    input.focus();
    changeViewport(410, 100);
    viewport.scale = 2;
    changeViewport(205, 250);
    expect(result.current).toEqual({ height: 410, top: 100, keyboardOpen: true });
    changeViewport(205, 300, 'scroll');
    expect(result.current.top).toBe(100);
    viewport.scale = 1;
    changeViewport(844);
    expect(result.current).toEqual({ height: 844, top: 0, keyboardOpen: false });
  });

  it('remeasures late Safari geometry after focus, orientation and pageshow, without polling forever', () => {
    const { result } = renderHook(useAppViewport);
    input.focus();
    flushFrame();
    viewport.height = 410;
    viewport.offsetTop = 90;
    act(() => { vi.advanceTimersByTime(150); });
    flushFrame();
    expect(result.current.keyboardOpen).toBe(true);
    input.blur();
    viewport.height = 844;
    viewport.offsetTop = 0;
    window.dispatchEvent(new Event('pageshow'));
    act(() => { vi.advanceTimersByTime(450); });
    flushFrame();
    expect(result.current).toEqual({ height: 844, top: 0, keyboardOpen: false });
    window.dispatchEvent(new Event('orientationchange'));
    viewport.height = 390;
    vi.stubGlobal('innerHeight', 390);
    vi.spyOn(document.documentElement, 'clientHeight', 'get').mockReturnValue(390);
    act(() => { vi.advanceTimersByTime(450); });
    flushFrame();
    expect(result.current).toEqual({ height: 390, top: 0, keyboardOpen: false });
    expect(vi.getTimerCount()).toBe(0);
    expect(frames.size).toBe(0);
  });

  it('falls back to window height when VisualViewport is unavailable', () => {
    vi.stubGlobal('visualViewport', undefined);
    const { result } = renderHook(useAppViewport);
    expect(result.current.height).toBe(844);
    vi.stubGlobal('innerHeight', 430);
    window.dispatchEvent(new Event('resize'));
    flushFrame();
    expect(result.current).toEqual({ height: 430, top: 0, keyboardOpen: false });
  });

  it('rejects zero or invalid sizes and clamps negative overscroll offsets', () => {
    const { result } = renderHook(useAppViewport);
    changeViewport(0, 50);
    expect(result.current.height).toBe(844);
    changeViewport(Number.NaN, 50);
    expect(result.current.height).toBe(844);
    changeViewport(844, -12);
    expect(result.current.top).toBe(0);
  });

  it('does not mistake ordinary toolbar changes or non-editable focus for a keyboard', () => {
    const { result } = renderHook(useAppViewport);
    input.focus();
    changeViewport(780);
    expect(result.current.keyboardOpen).toBe(false);
    input.type = 'checkbox';
    changeViewport(410);
    expect(result.current.keyboardOpen).toBe(false);
    input.type = 'search';
    mobile = false;
    changeViewport(410);
    expect(result.current.keyboardOpen).toBe(false);
  });

  it('removes listeners and cancels all pending frame and recovery work on unmount', () => {
    const { result, unmount } = renderHook(useAppViewport);
    input.focus();
    act(() => { vi.advanceTimersByTime(0); });
    expect(frames.size).toBe(1);
    expect(vi.getTimerCount()).toBe(2);
    unmount();
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    input.blur();
    input.focus();
    viewport.dispatchEvent(new Event('resize'));
    viewport.dispatchEvent(new Event('scroll'));
    window.dispatchEvent(new Event('resize'));
    window.dispatchEvent(new Event('orientationchange'));
    window.dispatchEvent(new Event('pageshow'));
    act(() => { vi.advanceTimersByTime(0); });
    expect(frames.size).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    expect(result.current).toEqual({ height: 844, top: 0, keyboardOpen: false });
  });
});
