import gsap from 'gsap';
import { ScrollTrigger } from 'gsap/ScrollTrigger';

gsap.registerPlugin(ScrollTrigger);

const EASE = 'expo.out';

/**
 * Movimento della pagina, orchestrato in un solo punto. Il contenuto è visibile anche senza JavaScript;
 * con "riduci movimento" non parte nessuna animazione.
 */
export function setupMotion(root: HTMLElement): () => void {
  const mm = gsap.matchMedia();
  mm.add({ wide: '(min-width: 1100px)', motion: '(prefers-reduced-motion: no-preference)' }, (ctx) => {
    const { wide, motion } = ctx.conditions as { wide: boolean; motion: boolean };
    if (!motion) return;
    const hero = root.querySelector<HTMLElement>('.ow-hero');
    const panels = root.querySelectorAll<HTMLElement>('.ow-hero__panel, .ow-routecard, .ow-controls');
    let cleanup = () => {};

    // Apertura: il nome compare sopra la mappa, poi con lo scorrimento ci si entra dentro e la mappa resta sola.
    if (hero) {
      gsap.set('.ow-intro, .ow-intro__tint', { display: 'block' });
      gsap.from('.ow-intro__sheet', { scale: 0.94, opacity: 0, duration: 1.4, ease: EASE });
      gsap.from('.ow-intro__payoff', { y: 16, autoAlpha: 0, duration: 1, ease: EASE, delay: 0.5 });

      if (wide) {
        // La hero resta ferma mentre il nome si apre; poi entrano ricerca, scheda del percorso e controlli.
        gsap.set(panels, { opacity: 0, y: 48, pointerEvents: 'none' });
        const tl = gsap.timeline({
          scrollTrigger: { trigger: hero, start: 'top top', end: '+=90%', pin: true, scrub: 0.6, anticipatePin: 1 },
        });
        tl.to('.ow-intro__payoff', { opacity: 0, y: -24, duration: 0.25 }, 0)
          .to('.ow-intro__sheet', { scale: 9, transformOrigin: '50% 50%', ease: 'power2.in', duration: 0.7 }, 0)
          .to('.ow-intro__tint', { opacity: 0, duration: 0.3 }, 0.35)
          .to('.ow-intro', { autoAlpha: 0, duration: 0.25 }, 0.55)
          .set(panels, { pointerEvents: 'auto' }, 0.6)
          .to(panels, { opacity: 1, y: 0, stagger: 0.06, duration: 0.35, ease: 'power2.out' }, 0.6);
        // Chi arriva da tastiera non deve finire su un pannello ancora invisibile: si salta alla fine dell'apertura.
        const onFocus = () => { const st = tl.scrollTrigger; if (st && st.progress < 1) window.scrollTo({ top: st.end, behavior: 'auto' }); };
        hero.addEventListener('focusin', onFocus);
        cleanup = () => hero.removeEventListener('focusin', onFocus);
      } else {
        gsap.timeline({ scrollTrigger: { trigger: '.ow-hero__map', start: 'top top', end: 'bottom 35%', scrub: 0.5 } })
          .to('.ow-intro__sheet', { scale: 6, transformOrigin: '50% 50%', ease: 'power2.in' }, 0)
          .to('.ow-intro__tint', { opacity: 0, ease: 'power1.in' }, 0)
          .to('.ow-intro', { autoAlpha: 0, ease: 'power1.in' }, 0.2);
        gsap.from(panels, { y: 24, autoAlpha: 0, duration: 1, ease: EASE, stagger: 0.12, delay: 0.2, clearProps: 'transform,opacity,visibility' });
      }
    }

    // Le icone a goccia cadono sulla pagina come segnaposto, poi sale il titolo.
    root.querySelectorAll<HTMLElement>('[data-statement]').forEach((item) => {
      gsap.timeline({ scrollTrigger: { trigger: item, start: 'top 80%', once: true } })
        .from(item.querySelector('.ow-droppin__head'), { y: -64, scale: 0.3, autoAlpha: 0, duration: 0.75, ease: 'back.out(2)' })
        .from(item.querySelector('.ow-droppin__dot'), { scale: 0, autoAlpha: 0, duration: 0.3, ease: 'back.out(3)' }, '-=0.25')
        .from(item.querySelectorAll('.ow-statement-item__text span'), { yPercent: 50, autoAlpha: 0, duration: 0.9, ease: EASE, stagger: 0.1 }, '-=0.45');
    });

    ScrollTrigger.batch(root.querySelectorAll('[data-reveal]'), {
      start: 'top 88%',
      once: true,
      // Come in una lettura a fuoco: il testo arriva sfocato e si assesta nitido.
      onEnter: (els) => gsap.from(els, { y: 28, autoAlpha: 0, filter: 'blur(8px)', duration: 0.9, ease: EASE, stagger: 0.08, clearProps: 'transform,opacity,visibility,filter' }),
    });

    // La frase sul problema si accende parola per parola mentre la si legge.
    root.querySelectorAll<HTMLElement>('[data-scrub]').forEach((el) => {
      gsap.fromTo(el.children, { opacity: 0.16 }, {
        opacity: 1, ease: 'none', stagger: 0.05,
        scrollTrigger: { trigger: el, start: 'top 82%', end: 'bottom 45%', scrub: 0.6 },
      });
    });

    return () => cleanup();
  });
  return () => mm.revert();
}
