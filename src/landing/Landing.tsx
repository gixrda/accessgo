import { useEffect, useRef, useState } from 'react';
import { Icon } from '../components/Icon.tsx';
import type { IconName } from '../lib/icons.ts';
import { APP_URL, CLOUD_URL, copy, REPO_URL } from './copy.ts';
import { DemoSection } from './DemoSection.tsx';
import { Hero } from './Hero.tsx';
import { Benefits, Project } from './BenefitsProject.tsx';
import { FeatureBento } from './FeatureBento.tsx';
import { BASE } from './staticData.ts';
import { PinnedTitle } from './PinnedTitle.tsx';
import { RouteRail } from './RouteRail.tsx';
import { setupMotion } from './motion.ts';
import { useMapData } from './useLanding.ts';

function Logo() {
  return (
    <a className="ow-logo" href="#top" aria-label="OpenWay, inizio pagina">
      <img src={`${BASE}logo.png`} alt="" width="32" height="32" />
      <span>OpenWay</span>
    </a>
  );
}

function Header() {
  const [solid, setSolid] = useState(false);
  const [open, setOpen] = useState(false);
  useEffect(() => {
    // Sopra la mappa l'intestazione è vetro; sul resto della pagina diventa una superficie piena.
    // Sopra la hero (anche mentre resta fissata durante l'apertura) l'intestazione resta vetro.
    const onScroll = () => {
      const hero = document.querySelector('.ow-hero');
      setSolid(hero ? hero.getBoundingClientRect().bottom < 120 : window.scrollY > window.innerHeight);
    };
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, []);
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  return (
    <header className={`ow-header${solid ? ' is-solid' : ''}${open ? ' is-open' : ''}`}>
      <div className="ow-header__bar ow-glass">
        <Logo />
        <nav className="ow-nav" aria-label={copy.nav.label}>
          <ul id="ow-nav-list" className="ow-nav__list">
            {copy.nav.links.map((l) => (
              <li key={l.href}><a href={l.href} onClick={() => setOpen(false)}>{l.label}</a></li>
            ))}
          </ul>
        </nav>
        <a className="ow-btn ow-btn--primary ow-btn--sm ow-header__cta" href={APP_URL}>{copy.nav.cta}</a>
        <button type="button" className="ow-header__menu" aria-expanded={open} aria-controls="ow-nav-list" onClick={() => setOpen((v) => !v)}>
          {open ? <Icon name="close" size={18} /> : <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M2 4.5h12M2 8h12M2 11.5h12" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>}
          <span>{copy.nav.menu}</span>
        </button>
      </div>
    </header>
  );
}

function Statements() {
  const s = copy.statements;
  return (
    <section className="ow-section ow-statements" aria-labelledby="ow-statements-title">
      <h2 id="ow-statements-title" className="ow-sr">{s.title}</h2>
      <ul className="ow-container ow-statements__list">
        {s.items.map((it) => (
          <li key={it.text.join(' ')} className="ow-statement-item" data-statement>
            <span className="ow-droppin" aria-hidden="true">
              <span className="ow-droppin__head"><Icon name={it.icon as IconName} size={30} /></span>
              <span className="ow-droppin__dot" />
            </span>
            <p className="ow-statement-item__text">{it.text.map((line) => <span key={line}>{line}</span>)}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function Faq() {
  const f = copy.faq;
  return (
    <section id="domande" className="ow-section ow-faq" aria-labelledby="ow-faq-title">
      <div className="ow-container ow-faq__inner">
        <h2 id="ow-faq-title" className="ow-h1" data-reveal>{f.title}</h2>
        <div className="ow-faq__list">
          {f.items.map((it) => (
            <details key={it.q} className="ow-faq__item" data-reveal>
              <summary>{it.q}<span className="ow-faq__chev" aria-hidden="true" /></summary>
              <p>{it.a}</p>
            </details>
          ))}
        </div>
      </div>
    </section>
  );
}

function Problem() {
  const p = copy.problem;
  return (
    <section id="problema" className="ow-section ow-problem" aria-labelledby="ow-problem-title">
      <div className="ow-container ow-problem__grid">
        <h2 id="ow-problem-title" className="ow-h1 ow-problem__title" data-reveal><PinnedTitle text={p.title} icon="kerb" /></h2>
        <div className="ow-problem__body">
          <p className="ow-statement" data-scrub>
            {p.statement.split(' ').map((w, i) => <span key={i}>{w} </span>)}
          </p>
          <div className="ow-problem__points">
            {p.points.map((pt) => (
              <div key={pt.title} className="ow-point" data-reveal>
                <h3 className="ow-h3">{pt.title}</h3>
                <p>{pt.text}</p>
              </div>
            ))}
          </div>
          <p className="ow-caption" data-reveal>{p.source}</p>
        </div>
      </div>
    </section>
  );
}

function Closing() {
  const c = copy.closing;
  return (
    <section className="ow-closing" aria-labelledby="ow-closing-title">
      <div className="ow-container ow-closing__inner" data-statement>
        <span className="ow-droppin" aria-hidden="true">
          <span className="ow-droppin__head"><Icon name="pin" size={30} /></span>
          <span className="ow-droppin__dot" />
        </span>
        <h2 id="ow-closing-title" className="ow-display ow-statement-item__text">{c.title.split(', ').map((l, i, all) => <span key={l}>{i < all.length - 1 ? `${l},` : l}</span>)}</h2>
        <p className="ow-lead">{c.text}</p>
        <div className="ow-actions">
          <a className="ow-btn ow-btn--primary" href={APP_URL}>{c.primary}</a>
          <a className="ow-btn ow-btn--secondary" href={REPO_URL} rel="noopener noreferrer">{c.secondary}</a>
        </div>
      </div>
    </section>
  );
}

function Footer() {
  const f = copy.footer;
  return (
    <footer className="ow-footer">
      <div className="ow-container ow-footer__grid">
        <div className="ow-footer__brand">
          <Logo />
          <p className="ow-footer__payoff">{copy.meta.payoff}</p>
          <p>{f.about}</p>
        </div>
        <nav aria-labelledby="ow-footer-product">
          <h2 id="ow-footer-product" className="ow-footer__title">{f.productTitle}</h2>
          <ul>
            <li><a href={APP_URL}>{f.app}</a></li>
            {copy.nav.links.map((l) => <li key={l.href}><a href={l.href}>{l.label}</a></li>)}
          </ul>
        </nav>
        <nav aria-labelledby="ow-footer-project">
          <h2 id="ow-footer-project" className="ow-footer__title">{f.projectTitle}</h2>
          <ul>
            <li><a href={REPO_URL} rel="noopener noreferrer">{f.repo}</a></li>
            <li><a href={CLOUD_URL} rel="noopener noreferrer">{f.cloud}</a></li>
          </ul>
        </nav>
        <div className="ow-footer__privacy">
          <h2 className="ow-footer__title">{f.privacyTitle}</h2>
          {f.privacy.map((t) => <p key={t}>{t}</p>)}
          <ul className="ow-footer__links">
            {f.privacyLinks.map((l) => <li key={l.href}><a href={l.href} rel="noopener noreferrer">{l.label}</a></li>)}
          </ul>
        </div>
        <p className="ow-footer__credits">{f.credits}</p>
      </div>
    </footer>
  );
}

export function Landing() {
  const { features, reports } = useMapData();
  const root = useRef<HTMLDivElement>(null);
  useEffect(() => (root.current ? setupMotion(root.current) : undefined), []);

  return (
    <div ref={root} id="top">
      <a className="ow-skip" href="#contenuto">Vai al contenuto</a>
      <Header />
      <RouteRail />
      <main id="contenuto">
        <Hero features={features} reports={reports} />
        <Statements />
        <Problem />
        <FeatureBento />
        <DemoSection features={features} reports={reports} />
        <Benefits />
        <Project />
        <Faq />
        <Closing />
      </main>
      <Footer />
    </div>
  );
}
