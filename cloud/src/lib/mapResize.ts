import type L from 'leaflet';

/** Leaflet watches window resizes, but not changes to the mobile bottom sheet. */
export function observeMapSize(map: Pick<L.Map, 'getContainer' | 'invalidateSize'>): () => void {
  const container = map.getContainer();
  let frame: number | null = null;
  let previousWidth = 0;
  let previousHeight = 0;
  let disposed = false;

  const refresh = () => {
    frame = null;
    if (disposed) return;
    const { clientWidth: width, clientHeight: height } = container;
    if (!width || !height || (width === previousWidth && height === previousHeight)) return;
    previousWidth = width;
    previousHeight = height;
    // pan=true keeps the geographic centre stable as the visible area changes.
    map.invalidateSize({ pan: true, animate: false, debounceMoveend: true });
  };
  const schedule = () => {
    if (!disposed && frame === null) frame = window.requestAnimationFrame(refresh);
  };

  const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(schedule);
  observer?.observe(container);
  if (!observer) window.addEventListener('resize', schedule);
  schedule();

  return () => {
    disposed = true;
    observer?.disconnect();
    if (!observer) window.removeEventListener('resize', schedule);
    if (frame !== null) window.cancelAnimationFrame(frame);
  };
}
