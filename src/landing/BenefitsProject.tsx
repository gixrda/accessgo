import { MotionConfig, animate, motion, useInView, useReducedMotion, type Variants } from 'motion/react';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';
import type { IconName } from '../lib/icons.ts';
import { copy, REPO_URL } from './copy.ts';
import { BASE } from './staticData.ts';

const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.18, delayChildren: 0.2 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 12, filter: 'blur(6px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 240, damping: 24 } },
};
const pop: Variants = {
  hidden: { opacity: 0, scale: 0.3 },
  shown: { opacity: 1, scale: 1, transition: { type: 'spring', stiffness: 420, damping: 16 } },
};

/** Con "riduci movimento" tutto parte già completo; altrimenti si anima quando entra nella vista. */
function useReveal() {
  const reduce = useReducedMotion();
  return reduce ? { initial: false as const, animate: 'shown' } : { initial: 'hidden', whileInView: 'shown', viewport: { once: true, amount: 0.35 } };
}

const v = copy.benefits.visual;

/** Un tratto di percorso: la linea si disegna, poi i punti di attenzione compaiono nell'ordine in cui si incontrano. */
function AlongVisual() {
  const reduce = useReducedMotion();
  return (
    <motion.div className="ow-along" variants={list} {...useReveal()}>
      <div className="ow-along__track">
        <span className="endpoint endpoint--sm">A</span>
        <motion.span className="ow-along__line" variants={{ hidden: { scaleX: 0 }, shown: { scaleX: 1, transition: { duration: reduce ? 0 : 1.1, ease: [0.2, 0.8, 0.2, 1] } } }} />
        {v.stops.map((_, i) => (
          <motion.span key={i} className="route-num ow-along__num" style={{ left: `${22 + i * 26}%` }} variants={pop}>{i + 1}</motion.span>
        ))}
        <span className="endpoint endpoint--B endpoint--sm">B</span>
      </div>
      <ol className="ow-along__list">
        {v.stops.map((s, i) => (
          <motion.li key={s} variants={item}><span className="route-num">{i + 1}</span>{s}</motion.li>
        ))}
      </ol>
    </motion.div>
  );
}

function MissingVisual() {
  return (
    <motion.ul className="ow-missing" variants={list} {...useReveal()}>
      {v.missing.map((m) => (
        <motion.li key={m.label} variants={item}>
          {m.kind === 'road' ? <span className="ow-missing__road" aria-hidden="true" /> : <span className="mk mk--info mk--inline" aria-hidden="true" />}
          {m.label}
        </motion.li>
      ))}
    </motion.ul>
  );
}

/** Gli stati reali di una segnalazione, uno dopo l'altro: chi li cambia è sempre un moderatore. */
function StatusVisual() {
  return (
    <motion.div className="ow-status" variants={list} {...useReveal()}>
      <ol className="ow-status__steps">
        {v.statuses.map((s, i) => (
          <motion.li key={s} variants={item} className={`ow-status__step ow-status__step--${i}`}>
            <span className={`pin-mini${i ? ' pin-mini--ok' : ''}`} aria-hidden="true">{i ? '✓' : '?'}</span>{s}
          </motion.li>
        ))}
      </ol>
      <motion.p variants={item} className="ow-status__note">{v.statusNote}</motion.p>
    </motion.div>
  );
}

function ModesVisual() {
  return (
    <motion.ul className="ow-modes" variants={list} {...useReveal()}>
      {v.modes.map((m) => (
        <motion.li key={m.label} variants={pop} whileHover={{ y: -4 }}>
          <span className="ow-modes__icon"><Icon name={m.icon as IconName} size={22} /></span>{m.label}
        </motion.li>
      ))}
    </motion.ul>
  );
}

const VISUALS: Record<string, () => ReactNode> = { lungo: AlongVisual, manca: MissingVisual, aiuta: StatusVisual, modi: ModesVisual };

export function Benefits() {
  const b = copy.benefits;
  return (
    <section id="benefici" className="ow-section ow-benefits" aria-labelledby="ow-benefits-title">
      <MotionConfig reducedMotion="user">
        <div className="ow-container">
          <header className="ow-benefits__head">
            <h2 id="ow-benefits-title" className="ow-display" data-reveal>
              {b.title.split('. ').map((line, i, all) => <span key={line}>{i < all.length - 1 ? `${line}.` : line}</span>)}
            </h2>
            <p className="ow-lead" data-reveal>{b.lead}</p>
          </header>
          <div className="ow-benefits__grid">
            {b.items.map((it) => {
              const Visual = VISUALS[it.id];
              return (
                <motion.article key={it.id} className={`ow-benefit ow-benefit--${it.id}`} aria-labelledby={`b-${it.id}`}
                  whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
                  <div className="ow-benefit__visual" aria-hidden="true"><Visual /></div>
                  <h3 id={`b-${it.id}`} className="ow-h3">{it.title}</h3>
                  <p>{it.text}</p>
                </motion.article>
              );
            })}
          </div>
        </div>
      </MotionConfig>
    </section>
  );
}

/** Numero che conta fino al valore reale quando entra nella vista; con "riduci movimento" compare subito. */
function CountUp({ value }: { value: number }) {
  const ref = useRef<HTMLSpanElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.6 });
  const reduce = useReducedMotion();
  const [shown, setShown] = useState(reduce ? value : 0);
  useEffect(() => {
    if (!inView || reduce) { if (reduce) setShown(value); return; }
    const controls = animate(0, value, { duration: 1.4, ease: [0.2, 0.8, 0.2, 1], onUpdate: (n) => setShown(Math.round(n)) });
    return () => controls.stop();
  }, [inView, reduce, value]);
  return <span ref={ref}>{shown.toLocaleString('it-IT')}</span>;
}

export function Project() {
  const p = copy.project;
  return (
    <section id="progetto" className="ow-section ow-project" aria-labelledby="ow-project-title">
      <MotionConfig reducedMotion="user">
        <div className="ow-container">
          <div className="ow-project__top">
            <div className="ow-project__text">
              <h2 id="ow-project-title" className="ow-h1" data-reveal>{p.title}</h2>
              {p.text.map((para) => <p key={para} className="ow-body-lg" data-reveal>{para}</p>)}
            </div>
            <motion.aside className="ow-placecard" aria-label="Scheda del progetto" data-reveal whileHover={{ rotate: -0.6, y: -4 }}>
              <div className="ow-placecard__head">
                <img src={`${BASE}logo.png`} alt="" width="56" height="56" />
                <div>
                  <p className="ow-placecard__name">{p.card.name}</p>
                  <p className="ow-placecard__kind">{p.card.kind}</p>
                </div>
              </div>
              <dl className="ow-placecard__rows">
                {p.card.rows.map((r) => <div key={r.label}><dt>{r.label}</dt><dd>{r.value}</dd></div>)}
              </dl>
              <a className="ow-btn ow-btn--secondary ow-btn--sm" href={REPO_URL} rel="noopener noreferrer">{p.card.repo}</a>
            </motion.aside>
          </div>

          <div className="ow-figures">
            <h3 className="ow-h3">{p.figuresTitle}</h3>
            <ul>
              {p.figures.map((f) => (
                <li key={f.label} data-reveal><strong><CountUp value={f.value} /></strong><span>{f.label}</span></li>
              ))}
            </ul>
            <p className="ow-caption">{p.figuresNote}</p>
          </div>

          <div className="ow-project__bottom">
            <div>
              <h3 className="ow-h3">{p.stackTitle}</h3>
              <ul className="ow-tiles">
                {p.stack.map((s) => (
                  <motion.li key={s.name} data-reveal whileHover={{ y: -4 }} transition={{ type: 'spring', stiffness: 400, damping: 24 }}>
                    <span className="ow-tiles__icon" aria-hidden="true"><Icon name={s.icon as IconName} size={20} /></span>
                    <strong>{s.name}</strong><span>{s.role}</span>
                  </motion.li>
                ))}
              </ul>
            </div>
            <div className="ow-limits-card" data-reveal>
              <h3 className="ow-h3"><Icon name="warning" size={20} />{p.limitsTitle}</h3>
              <ul className="ow-limits">{p.limits.map((l) => <li key={l}>{l}</li>)}</ul>
            </div>
          </div>
        </div>
      </MotionConfig>
    </section>
  );
}
