import { MotionConfig, motion, useReducedMotion, type Variants } from 'motion/react';
import type { ReactNode } from 'react';
import { Icon } from '../components/Icon.tsx';
import { copy } from './copy.ts';

// Piccole interfacce costruite con lo stesso vocabolario dell'app (marker, verdetto, stati, dettatura).
// Sono illustrazioni: testi e stati sono quelli reali dell'app, l'esempio di percorso è via Roma.

const list: Variants = { hidden: {}, shown: { transition: { staggerChildren: 0.09, delayChildren: 0.15 } } };
const item: Variants = {
  hidden: { opacity: 0, y: 14, filter: 'blur(6px)' },
  shown: { opacity: 1, y: 0, filter: 'blur(0px)', transition: { type: 'spring', stiffness: 260, damping: 24 } },
};
const view = { once: true, amount: 0.25 } as const;
const ui = copy.features.ui;

// Con "riduci movimento" le interfacce partono già complete: nessun contenuto deve dipendere da un'animazione.
function useReveal() {
  const reduce = useReducedMotion();
  return reduce ? { initial: false as const, animate: 'shown' } : { initial: 'hidden', whileInView: 'shown', viewport: view };
}

function ExploreUi() {
  const marks: Record<string, ReactNode> = {
    known: <span className="mk mk--known mk--inline" />,
    report: <span className="pin-mini">?</span>,
    possible: <span className="mk mk--possible mk--inline" />,
    positive: <span className="mk mk--positive mk--inline" />,
    info: <span className="mk mk--info mk--inline" />,
    place: <span className="mk mk--place mk--inline" />,
  };
  return (
    <motion.ul className="ow-mini-chips" variants={list} {...useReveal()}>
      {ui.layers.map((l) => (
        <motion.li key={l.label} variants={item} whileHover={{ y: -3, scale: 1.03 }} transition={{ type: 'spring', stiffness: 400, damping: 22 }}>
          {marks[l.mark]}{l.label}
        </motion.li>
      ))}
    </motion.ul>
  );
}

function ReportUi() {
  return (
    <motion.div className="ow-mini-card" variants={list} {...useReveal()}>
      <motion.p variants={item} className="ow-mini-quote">{ui.report.text}</motion.p>
      <motion.p variants={item} className="ow-mini-label">{ui.report.understood}</motion.p>
      <motion.p variants={item} className="ow-mini-strong"><Icon name="barrier" size={16} />{ui.report.category}</motion.p>
      <motion.p variants={item} className="ow-mini-label">{ui.report.question}</motion.p>
      <motion.div variants={item} className="ow-mini-choice">
        <span>{ui.report.yes}</span><span className="is-on">{ui.report.no}</span>
      </motion.div>
      <motion.p variants={item} className="ow-mini-status"><span className="pin-mini">?</span>{ui.report.status}</motion.p>
    </motion.div>
  );
}

function RouteUi() {
  return (
    <motion.div className="ow-mini-card" variants={list} {...useReveal()}>
      <motion.p variants={item} className="ow-mini-verdict"><Icon name="warning" size={18} />{ui.route.verdict}</motion.p>
      <motion.ol className="ow-mini-alerts" variants={list}>
        {ui.route.alerts.map((a, i) => (
          <motion.li key={i} variants={item}><span className="route-num">{i + 1}</span>{a}</motion.li>
        ))}
      </motion.ol>
      <motion.p variants={item} className="ow-mini-note">{ui.route.note}</motion.p>
    </motion.div>
  );
}

function VoiceUi() {
  return (
    <motion.div className="ow-mini-voice" variants={list} {...useReveal()}>
      <motion.span variants={item} className="ow-mini-mic">
        <span className="ow-mini-mic__ring" /><Icon name="mic" size={18} />{ui.voice.button}
      </motion.span>
      <motion.p variants={item} className="ow-mini-bubble">{ui.voice.said}</motion.p>
      <motion.p variants={item} className="ow-mini-bubble is-app"><Icon name="search" size={16} />{ui.voice.searched}</motion.p>
    </motion.div>
  );
}

const UIS: Record<string, () => ReactNode> = { esplora: ExploreUi, segnala: ReportUi, naviga: RouteUi, voce: VoiceUi };

export function FeatureBento() {
  const f = copy.features;
  return (
    <section id="come-funziona" className="ow-section ow-features" aria-labelledby="ow-features-title">
      <MotionConfig reducedMotion="user">
        <div className="ow-container">
          <header className="ow-features__head">
            <h2 id="ow-features-title" className="ow-h1" data-reveal>{f.title}</h2>
            <p className="ow-lead" data-reveal>{f.lead}</p>
          </header>
          <div className="ow-bento">
            {f.items.map((it) => {
              const Ui = UIS[it.id];
              return (
                <motion.article key={it.id} id={it.id} className={`ow-bento__card ow-bento__card--${it.id}`} aria-labelledby={`${it.id}-title`}
                  whileHover={{ y: -6 }} transition={{ type: 'spring', stiffness: 300, damping: 24 }}>
                  <div className="ow-bento__text">
                    <h3 id={`${it.id}-title`} className="ow-h3">{it.title}</h3>
                    <p>{it.text}</p>
                  </div>
                  <div className="ow-bento__ui" aria-hidden="true"><Ui /></div>
                </motion.article>
              );
            })}
          </div>
          <p className="ow-caption ow-bento__caption">{f.uiNote}</p>
        </div>
      </MotionConfig>
    </section>
  );
}
