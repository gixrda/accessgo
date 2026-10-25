import gsap from 'gsap';
import L from 'leaflet';
import { useEffect } from 'react';
import { useMap } from 'react-leaflet';
import type { LatLngTuple } from '../../shared/types.ts';
import { cumulative, pointAt } from './livingLine.ts';

/**
 * The Living Line: un punto compare sulla strada, la linea esplora il percorso reale, a metà si aprono
 * per poco altre strade vicine (solo animazione), poi la linea arriva e compare la destinazione.
 * Layer Leaflet SVG creati una volta; il disegno usa pathLength=1 e stroke-dashoffset, così resta
 * allineato a zoom e pan. Con `playing` falso mostra il percorso completo e fermo.
 */
interface Props {
  coords: LatLngTuple[];
  branches: LatLngTuple[][];
  playing: boolean;
  /** Percorso a piedi di ripiego: tratteggiato come nell'app */
  dashed?: boolean;
  /** Frazione del percorso da cui partono le diramazioni (la stessa usata per calcolarle) */
  at?: number;
}

const BLUE = '#1677FF';
const DASH = '0.018 0.014'; // tratteggio in unità di pathLength, per il ripiego a piedi
const destIcon = L.divIcon({ html: '<span class="endpoint endpoint--B">B</span>', className: 'mk-wrap ow-living__dest', iconSize: [32, 32], iconAnchor: [16, 16] });
const startIcon = L.divIcon({ html: '<span class="endpoint endpoint--A">A</span>', className: 'mk-wrap ow-living__start', iconSize: [32, 32], iconAnchor: [16, 16] });

function measured(layer: L.Path): SVGPathElement {
  const el = layer.getElement() as SVGPathElement;
  el.setAttribute('pathLength', '1');
  return el;
}

export function LivingLine({ coords, branches, playing, dashed = false, at = 0.45 }: Props) {
  const map = useMap();

  useEffect(() => {
    if (coords.length < 2) return;
    const renderer = L.svg({ padding: 0.5 });
    const casing = L.polyline(coords, { renderer, color: '#FFFFFF', weight: 11, opacity: 0.95, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    const forks = branches.map((b) => L.polyline(b, { renderer, color: BLUE, weight: 4, opacity: 1, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map));
    const line = L.polyline(coords, { renderer, color: BLUE, weight: 6, lineCap: 'round', lineJoin: 'round', interactive: false }).addTo(map);
    const head = L.circleMarker(coords[0], { renderer, radius: 7, weight: 3, color: '#FFFFFF', fillColor: BLUE, fillOpacity: 1, opacity: 1, interactive: false });
    const start = L.marker(coords[0], { icon: startIcon, keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);
    const dest = L.marker(coords[coords.length - 1], { icon: destIcon, keyboard: false, interactive: false, zIndexOffset: 1000 }).addTo(map);

    const casingEl = measured(casing), lineEl = measured(line);
    const forkEls = forks.map(measured);
    gsap.set(forkEls, { opacity: 0 }); // l'opacità visibile la decide la timeline, non Leaflet
    // Leaflet posiziona i marker con transform: si anima l'elemento interno, non il contenitore.
    const destEl = dest.getElement()!.firstElementChild as HTMLElement, startEl = start.getElement()!.firstElementChild as HTMLElement;
    const finalDash = dashed ? DASH : 'none';

    if (!playing) {
      gsap.set([casingEl, lineEl], { strokeDasharray: 'none', strokeDashoffset: 0, opacity: 1 });
      gsap.set(lineEl, { strokeDasharray: finalDash });
      return () => { [casing, line, start, dest, ...forks].forEach((l) => l.remove()); };
    }

    head.addTo(map);
    const headEl = head.getElement() as SVGPathElement;
    const cum = cumulative(coords);
    const state = { p: 0 };
    const draw = () => {
      const off = 1 - state.p;
      casingEl.style.strokeDashoffset = String(off);
      lineEl.style.strokeDashoffset = String(off);
      head.setLatLng(pointAt(coords, cum, state.p));
    };

    const tl = gsap.timeline({ repeat: -1, repeatDelay: 0.5, defaults: { ease: 'sine.inOut' } });
    tl.set([casingEl, lineEl], { strokeDasharray: '1 1', opacity: 1 })
      .set(state, { p: 0, onComplete: draw })
      .set(forkEls, { strokeDasharray: '1 1', strokeDashoffset: 1, opacity: 0 })
      .set([destEl, startEl, headEl], { opacity: 0 })
      .set(destEl, { scale: 0.4, transformOrigin: '50% 50%' })
      // A: il punto compare sulla strada
      .to([startEl, headEl], { opacity: 1, duration: 0.45, ease: 'power2.out' })
      // B: la linea esplora fino al bivio
      .to(state, { p: at, duration: 1.6, onUpdate: draw })
      // C: altre strade si aprono, rallentano e svaniscono (non sono itinerari)
      .to(forkEls, { opacity: 0.5, duration: 0.5, stagger: 0.12, ease: 'power1.out' }, '-=0.15')
      .to(forkEls, { strokeDashoffset: 0, duration: 0.9, stagger: 0.12, ease: 'power3.out' }, '<')
      .to(forkEls, { opacity: 0, duration: 0.7, stagger: 0.08, ease: 'power1.in' }, '+=0.25')
      // D: la linea trova la sua strada e arriva
      .to(state, { p: 1, duration: 1.2, onUpdate: draw }, '<-0.2')
      .to(headEl, { opacity: 0, duration: 0.3 }, '>-0.1')
      .set(lineEl, { strokeDasharray: finalDash })
      .to(destEl, { opacity: 1, scale: 1, duration: 0.5, ease: 'back.out(2.2)' }, '<')
      // E: il percorso resta un momento, poi si dissolve
      .to([casingEl, lineEl, startEl, destEl], { opacity: 0, duration: 0.7, ease: 'power1.inOut' }, '+=1.7');

    // Fuori dallo schermo o con la scheda nascosta l'animazione si ferma: niente lavoro inutile.
    const io = new IntersectionObserver(([e]) => { if (e.isIntersecting) tl.play(); else tl.pause(); });
    io.observe(map.getContainer());
    const onVisibility = () => (document.hidden ? tl.pause() : tl.play());
    document.addEventListener('visibilitychange', onVisibility);

    return () => {
      tl.kill();
      io.disconnect();
      document.removeEventListener('visibilitychange', onVisibility);
      [casing, line, head, start, dest, ...forks].forEach((l) => l.remove());
    };
  }, [map, coords, branches, playing, dashed, at]);

  return null;
}
