import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';
import { useEffect, useRef, useState } from 'react';
import { copy } from './copy.ts';

/**
 * Indice laterale disegnato come un percorso: ogni sezione è una tappa, la linea si riempie leggendo.
 * Compare dopo la hero, solo su schermi larghi; i link portano alle sezioni.
 */
export function RouteRail() {
  const [active, setActive] = useState<string | null>(null);
  const [shown, setShown] = useState(false);
  const fill = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const stops = copy.rail.map((s) => document.getElementById(s.id)).filter((e): e is HTMLElement => Boolean(e));
    if (!stops.length) return;
    const first = stops[0], last = stops[stops.length - 1];
    const triggers = stops.map((el) => ScrollTrigger.create({
      trigger: el, start: 'top 50%', end: 'bottom 50%', onToggle: (self) => { if (self.isActive) setActive(el.id); },
    }));
    triggers.push(ScrollTrigger.create({
      trigger: first, start: 'top 60%', endTrigger: last, end: 'bottom 40%',
      onToggle: (self) => setShown(self.isActive),
      onUpdate: (self) => { if (fill.current) gsap.set(fill.current, { scaleY: self.progress }); },
    }));
    return () => triggers.forEach((t) => t.kill());
  }, []);

  return (
    <nav className={`ow-rail${shown ? ' is-shown' : ''}`} aria-label="Sezioni della pagina">
      <span className="ow-rail__line" aria-hidden="true"><span ref={fill} className="ow-rail__fill" /></span>
      <ol>
        {copy.rail.map((s) => (
          <li key={s.id}>
            <a href={`#${s.id}`} aria-current={active === s.id ? 'true' : undefined} tabIndex={shown ? 0 : -1}>
              <span className="ow-rail__dot" aria-hidden="true" />
              <span className="ow-rail__label">{s.label}</span>
            </a>
          </li>
        ))}
      </ol>
    </nav>
  );
}
