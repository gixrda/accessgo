import { useEffect, useState } from 'react';

// Include phones in landscape; keep this query aligned with styles.css.
export const MOBILE_LAYOUT = '(max-width: 759px), (max-height: 500px) and (max-width: 1000px)';

export function useMobileLayout() {
  const [mobile, setMobile] = useState(() => window.matchMedia(MOBILE_LAYOUT).matches);
  useEffect(() => {
    const media = window.matchMedia(MOBILE_LAYOUT);
    const update = () => setMobile(media.matches);
    update();
    media.addEventListener('change', update);
    return () => media.removeEventListener('change', update);
  }, []);
  return mobile;
}

type AppViewport = { height?: number; top: number; keyboardOpen: boolean };

function hasEditableFocus() {
  const element = document.activeElement;
  if (element instanceof HTMLTextAreaElement) return !element.disabled && !element.readOnly;
  if (element instanceof HTMLSelectElement) return !element.disabled;
  if (element instanceof HTMLInputElement) {
    return !element.disabled && !element.readOnly
      && !/^(button|checkbox|color|file|hidden|image|radio|range|reset|submit)$/.test(element.type);
  }
  return element instanceof HTMLElement && element.isContentEditable;
}

/** Follow keyboard resizing and panning, without moving the layout during pinch zoom. */
export function useAppViewport() {
  const [viewportState, setViewportState] = useState<AppViewport>({ top: 0, keyboardOpen: false });
  useEffect(() => {
    const viewport = window.visualViewport;
    let current: AppViewport = { top: 0, keyboardOpen: false };
    let frame: number | null = null;
    let disposed = false;
    let recoveryTimers: number[] = [];

    const measure = () => {
      frame = null;
      if (disposed || (viewport && Math.abs(viewport.scale - 1) > 0.01)) return;
      const height = viewport?.height ?? window.innerHeight;
      // Safari can report a transient zero while the keyboard/orientation changes.
      if (!Number.isFinite(height) || height <= 0) return;
      const top = viewport && Number.isFinite(viewport.offsetTop) ? Math.max(0, viewport.offsetTop) : 0;
      const layoutHeight = Math.max(window.innerHeight, document.documentElement.clientHeight);
      const contracted = Boolean(viewport) && layoutHeight - height >= 120;
      const keyboardOpen = window.matchMedia(MOBILE_LAYOUT).matches && contracted
        && (hasEditableFocus() || current.keyboardOpen);
      // Keep the compact layout during the close animation even if blur happened first.
      const next = { height, top, keyboardOpen };
      if (next.height !== current.height || next.top !== current.top || next.keyboardOpen !== current.keyboardOpen) {
        current = next;
        setViewportState(next);
      }
    };
    const schedule = () => {
      if (!disposed && frame === null) frame = window.requestAnimationFrame(measure);
    };
    const recover = () => {
      schedule();
      recoveryTimers.forEach(window.clearTimeout);
      // iOS sometimes publishes the final geometry after the focus/pageshow event.
      recoveryTimers = [150, 450].map((delay) => window.setTimeout(schedule, delay));
    };
    measure();
    viewport?.addEventListener('resize', schedule);
    viewport?.addEventListener('scroll', schedule);
    window.addEventListener('resize', schedule);
    window.addEventListener('orientationchange', recover);
    window.addEventListener('pageshow', recover);
    document.addEventListener('focusin', recover);
    document.addEventListener('focusout', recover);
    return () => {
      disposed = true;
      viewport?.removeEventListener('resize', schedule);
      viewport?.removeEventListener('scroll', schedule);
      window.removeEventListener('resize', schedule);
      window.removeEventListener('orientationchange', recover);
      window.removeEventListener('pageshow', recover);
      document.removeEventListener('focusin', recover);
      document.removeEventListener('focusout', recover);
      recoveryTimers.forEach(window.clearTimeout);
      if (frame !== null) window.cancelAnimationFrame(frame);
    };
  }, []);
  return viewportState;
}
