import type L from 'leaflet';
import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type RefObject } from 'react';
import type { GeocodeResult, OsmFeature, Report } from '../../shared/types.ts';
import { api } from '../api.ts';
import { Icon } from '../components/Icon.tsx';
import { formatDistance, formatDuration } from '../lib/analysis.ts';
import { verdictOf } from '../lib/verdict.ts';
import { APP_URL, copy } from './copy.ts';
import { LandingMap } from './LandingMap.tsx';
import { bestFork } from './livingLine.ts';
import { geocodeDirect, STATIC } from './staticData.ts';
import { useAlerts, useRoute } from './useLanding.ts';

const t = copy.hero;
const HERO_ROUTE = copy.demo.scenarios[0];
const OVERLAY = '(min-width: 1100px)'; // da qui i pannelli stanno sopra la mappa, sotto si impilano

type Search =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'done'; query: string; results: GeocodeResult[] };

/** Nome e località come appaiono nella riga del risultato. */
const splitLabel = (label: string) => { const [name, ...rest] = label.split(', '); return { name, area: rest.slice(0, 3).join(', ') }; };
const rowLabel = (r: GeocodeResult) => { const { name, area } = splitLabel(r.label); return `${name}|${area}`; };

function SearchBox({ onPick, inputRef, compact }: { onPick: (r: GeocodeResult) => void; inputRef: RefObject<HTMLInputElement | null>; compact: boolean }) {
  const [query, setQuery] = useState('');
  const [search, setSearch] = useState<Search>({ status: 'idle' });
  const [picked, setPicked] = useState<GeocodeResult | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    const q = query.trim();
    if (q.length < 3) { setSearch({ status: 'error', message: t.tooShort }); return; }
    setSearch({ status: 'loading' });
    setPicked(null);
    try {
      // Nominatim può restituire più oggetti per lo stesso luogo (piazza, area pedonale…): una riga per ciò che si legge.
      const results = (await (STATIC ? geocodeDirect(q) : api.geocode(q))).filter((r, i, all) => all.findIndex((x) => rowLabel(x) === rowLabel(r)) === i);
      setSearch({ status: 'done', query: q, results });
    } catch (err) {
      setSearch({ status: 'error', message: (err as Error).message });
    }
  }

  const pick = (r: GeocodeResult) => { setPicked(r); onPick(r); };
  const message = search.status === 'error' ? search.message
    : search.status === 'done' && !search.results.length ? t.noResults(search.query) : '';

  return (
    <div className={`ow-search${compact ? ' is-compact' : ''}`}>
      <form className="ow-search__form" role="search" onSubmit={submit}>
        <label className="ow-search__label" htmlFor="ow-search-input">{t.searchLabel}</label>
        <div className="ow-search__field">
          <span className="ow-search__icon"><Icon name="search" size={18} /></span>
          <input
            ref={inputRef}
            id="ow-search-input"
            className="ow-search__input"
            type="search"
            autoComplete="off"
            enterKeyHint="search"
            placeholder={t.searchPlaceholder}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-describedby="ow-search-status"
          />
          <button className="ow-btn ow-btn--primary ow-search__submit" type="submit" disabled={search.status === 'loading'}>
            {search.status === 'loading' ? t.searching : t.searchButton}
          </button>
        </div>
      </form>
      <p id="ow-search-status" className="ow-search__status" role="status">{message}</p>
      {search.status === 'done' && search.results.length > 0 && (
        <ul className="ow-results" aria-label={t.resultsLabel}>
          {search.results.map((r) => {
            const { name, area } = splitLabel(r.label);
            const active = picked === r;
            return (
              <li key={`${r.lat},${r.lng}`} className={active ? 'is-active' : undefined}>
                <button type="button" className="ow-results__place" aria-pressed={active} onClick={() => pick(r)} title={r.label}>
                  <Icon name="pin" size={16} />
                  <span><strong>{name}</strong><span>{area}</span></span>
                </button>
                {active && !STATIC && (
                  <a className="ow-link" href={`${APP_URL}?to=${r.lat.toFixed(6)},${r.lng.toFixed(6)}`}>
                    {t.openRoute}<Icon name="route" size={16} />
                  </a>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}

/** true sotto i 768 px: il nome dell'apertura va su due righe per restare leggibile. */
function useNarrow(): boolean {
  const query = '(max-width: 767px)';
  const [narrow, setNarrow] = useState(() => window.matchMedia(query).matches);
  useEffect(() => {
    const mq = window.matchMedia(query);
    const on = () => setNarrow(mq.matches);
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, []);
  return narrow;
}

export function Hero({ features, reports }: { features: OsmFeature[]; reports: Report[] }) {
  const [map, setMap] = useState<L.Map | null>(null);
  const [exploring, setExploring] = useState(false);
  const narrow = useNarrow();
  const [destination, setDestination] = useState<GeocodeResult | null>(null);
  const heroRef = useRef<HTMLElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const cardRef = useRef<HTMLElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const exploreBtn = useRef<HTMLButtonElement>(null);

  const state = useRoute(HERO_ROUTE);
  const route = state.status === 'ready' ? state.route : null;
  const alerts = useAlerts(route, features, reports);

  // The Living Line gira da sola finché nessuno tocca la mappa; la scelta di chi usa la pagina ha sempre la precedenza.
  const reduceMotion = useMemo(() => window.matchMedia('(prefers-reduced-motion: reduce)').matches, []);
  const [userPaused, setUserPaused] = useState(false);
  const fork = useMemo(() => (route ? bestFork(route.coords, features) : { at: 0.45, branches: [] }), [route, features]);
  const branches = fork.branches;
  const playing = !reduceMotion && !userPaused && !exploring && !destination;
  const pauseLine = useCallback(() => setUserPaused(true), []);
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    const onKey = (e: KeyboardEvent) => { if (e.key.startsWith('Arrow') || e.key === '+' || e.key === '-') pauseLine(); };
    map.on('dragstart', pauseLine);
    container.addEventListener('keydown', onKey);
    container.addEventListener('dblclick', pauseLine);
    return () => { map.off('dragstart', pauseLine); container.removeEventListener('keydown', onKey); container.removeEventListener('dblclick', pauseLine); };
  }, [map, pauseLine]);
  const verdict = route ? verdictOf(route, alerts) : null;

  // Il percorso resta nello spazio libero tra i pannelli, a qualunque larghezza.
  const fitRoute = useCallback(() => {
    if (!map || !route) return;
    const box = map.getContainer().getBoundingClientRect();
    const overlay = window.matchMedia(OVERLAY).matches;
    const left = overlay && panelRef.current ? panelRef.current.getBoundingClientRect().right - box.left + 48 : 32;
    const right = overlay && cardRef.current ? box.right - cardRef.current.getBoundingClientRect().left + 48 : 72;
    map.fitBounds(route.coords, { paddingTopLeft: [left, overlay ? 112 : 88], paddingBottomRight: [right, 56], maxZoom: 18, animate: false });
  }, [map, route]);

  useEffect(() => {
    if (!exploring) fitRoute();
    let timer = 0;
    const onResize = () => { clearTimeout(timer); timer = window.setTimeout(() => { map?.invalidateSize(); if (!exploring) fitRoute(); }, 200); };
    window.addEventListener('resize', onResize);
    return () => { window.removeEventListener('resize', onResize); clearTimeout(timer); };
  }, [fitRoute, map, exploring]);

  const exit = useCallback(() => setExploring(false), []);

  // Esplorare dà alla mappa rotella e tastiera; uscendo (o scorrendo oltre la hero) la pagina torna a scorrere.
  useEffect(() => {
    if (!map) return;
    const container = map.getContainer();
    if (exploring) {
      map.scrollWheelZoom.enable();
      container.focus({ preventScroll: true });
      const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') exit(); };
      window.addEventListener('keydown', onKey);
      const io = new IntersectionObserver(([e]) => { if (e.intersectionRatio < 0.35) exit(); }, { threshold: [0.35] });
      if (heroRef.current) io.observe(heroRef.current);
      return () => { window.removeEventListener('keydown', onKey); io.disconnect(); };
    }
    map.scrollWheelZoom.disable();
  }, [exploring, map, exit]);

  // Su schermi stretti la mappa cambia altezza: Leaflet deve rimisurarla a transizione finita.
  useEffect(() => {
    if (!map) return;
    const timer = window.setTimeout(() => map.invalidateSize(), 340);
    return () => clearTimeout(timer);
  }, [exploring, map]);

  const wasExploring = useRef(false);
  useEffect(() => {
    if (wasExploring.current && !exploring) exploreBtn.current?.focus({ preventScroll: true });
    wasExploring.current = exploring;
  }, [exploring]);

  const pickPlace = (r: GeocodeResult) => {
    setDestination(r);
    map?.flyTo([r.lat, r.lng], Math.max(map.getZoom(), 17), { duration: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 0 : 0.8 });
  };

  return (
    <section ref={heroRef} className={`ow-hero${exploring ? ' is-exploring' : ''}`} aria-labelledby="ow-hero-title">
      <div className="ow-hero__map">
        <LandingMap mapRef={setMap} label={t.mapLabel} features={features} reports={reports} route={route} alerts={alerts} destination={destination}
          living={{ branches, playing, at: fork.at }} />
        <div className="ow-hero__halo" aria-hidden="true" />
        <div className="ow-controls ow-glass" role="group" aria-label="Controlli della mappa">
          <button type="button" className="ow-controls__btn" onClick={() => { pauseLine(); map?.zoomIn(); }} aria-label={copy.controls.zoomIn} title={copy.controls.zoomIn}>
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M8 3v10M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <span className="ow-controls__sep" aria-hidden="true" />
          <button type="button" className="ow-controls__btn" onClick={() => { pauseLine(); map?.zoomOut(); }} aria-label={copy.controls.zoomOut} title={copy.controls.zoomOut}>
            <svg width="18" height="18" viewBox="0 0 16 16" aria-hidden="true"><path d="M3 8h10" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" /></svg>
          </button>
          <span className="ow-controls__sep" aria-hidden="true" />
          <button type="button" className="ow-controls__btn" onClick={fitRoute} disabled={!route} aria-label={copy.controls.recenter} title={copy.controls.recenter}>
            <Icon name="locate" size={18} />
          </button>
        </div>
        {/* Apertura: il nome ritagliato in un foglio chiaro, la mappa vera si vede attraverso le lettere.
            Nascosta di default; la mostra motion.ts solo se il movimento è consentito. */}
        {/* La tinta sta fuori dall'overlay: dentro sarebbe isolata dallo z-index e non si fonderebbe con la mappa. */}
        <div className="ow-intro__tint" aria-hidden="true" />
        <div className="ow-intro" aria-hidden="true">
          <svg className="ow-intro__sheet" viewBox={narrow ? '260 -120 1080 980' : '0 0 1600 900'} preserveAspectRatio="xMidYMid meet">
            <defs>
              {/* Alone luminoso dietro il nome: ghiaccio al centro, bianco caldo ai bordi */}
              <radialGradient id="ow-intro-paper" gradientUnits="userSpaceOnUse" cx="800" cy="450" r="950">
                <stop offset="0" stopColor="#E3EDFF" />
                <stop offset="0.55" stopColor="#F1F5FC" />
                <stop offset="1" stopColor="#F8F9F7" />
              </radialGradient>
              <mask id="ow-intro-mask" maskUnits="userSpaceOnUse" x="-4000" y="-4000" width="9600" height="8900">
                <rect x="-4000" y="-4000" width="9600" height="8900" fill="#fff" />
                {narrow ? (
                  <text x="800" textAnchor="middle" className="ow-intro__word">
                    <tspan x="800" y="360">{copy.intro.word.slice(0, 4)}</tspan>
                    <tspan x="800" y="660">{copy.intro.word.slice(4)}</tspan>
                  </text>
                ) : (
                  <text x="800" y="450" textAnchor="middle" dominantBaseline="central" className="ow-intro__word">{copy.intro.word}</text>
                )}
              </mask>
            </defs>
            <rect x="-4000" y="-4000" width="9600" height="8900" className="ow-intro__paper" mask="url(#ow-intro-mask)" />
          </svg>
          <p className="ow-intro__payoff">{copy.intro.payoff}</p>
        </div>
        {exploring && (
          <div className="ow-explore ow-glass" role="status">
            <p>{t.exploring}</p>
            <button type="button" className="ow-btn ow-btn--secondary" onClick={exit}>{t.exitExplore}</button>
          </div>
        )}
      </div>

      <div className="ow-hero__layer">
        <div ref={panelRef} className="ow-hero__panel ow-glass">
          <div className="ow-hero__intro" aria-hidden={exploring} inert={exploring}>
            <div>
              <h1 id="ow-hero-title" className="ow-display">{t.title}</h1>
              <p className="ow-lead">{t.lead}</p>
            </div>
          </div>
          <SearchBox onPick={pickPlace} inputRef={inputRef} compact={exploring} />
          <div className="ow-hero__actions" aria-hidden={exploring} inert={exploring}>
            <div className="ow-actions">
              <button ref={exploreBtn} type="button" className="ow-btn ow-btn--primary" onClick={() => setExploring(true)}>{t.primary}</button>
              <a className="ow-btn ow-btn--secondary" href="#come-funziona">{t.secondary}</a>
            </div>
          </div>
        </div>

        <aside ref={cardRef} className="ow-routecard ow-glass" aria-labelledby="ow-routecard-title" aria-live="polite" hidden={exploring}>
          <h2 id="ow-routecard-title" className="ow-routecard__title">{copy.routeCard.title}<span>{copy.routeCard.place}</span></h2>
          {state.status === 'loading' || state.status === 'idle' ? (
            <p className="ow-routecard__state"><span className="ow-spinner" aria-hidden="true" />{copy.routeCard.loading}</p>
          ) : state.status === 'error' ? (
            <p className="ow-routecard__state is-error"><Icon name="warning" size={16} />{copy.routeCard.error}</p>
          ) : verdict && route && (
            <div className={`ow-verdict ow-verdict--${verdict.tone}`}>
              <p className="ow-verdict__title"><Icon name={verdict.tone === 'warn' ? 'warning' : 'check'} size={16} />{verdict.title}</p>
              <p className="ow-verdict__meta">{formatDistance(route.distanceM)}{route.durationS ? ` · circa ${formatDuration(route.durationS)}` : ''}</p>
            </div>
          )}
          <p className="ow-routecard__note">{route && route.mode !== 'wheelchair' && verdict ? verdict.text : copy.routeCard.note}</p>
          {state.status === 'ready' && state.recordedAt && <p className="ow-routecard__note">{copy.routeCard.recorded(new Date(state.recordedAt).toLocaleDateString('it-IT'))}</p>}
          {route && !reduceMotion && branches.length > 0 && <p className="ow-routecard__note">{copy.routeCard.branchesNote}</p>}
          {route && !reduceMotion && userPaused && !destination && !exploring && (
            <button type="button" className="ow-link ow-routecard__replay" onClick={() => setUserPaused(false)}>
              <Icon name="route" size={16} />{copy.routeCard.replay}
            </button>
          )}
          <ul className="ow-legend">
            {route && route.mode !== 'wheelchair'
              ? <li><span className="ow-legend__route is-dashed" aria-hidden="true" />{copy.routeCard.legend.footRoute}</li>
              : <li><span className="ow-legend__route" aria-hidden="true" />{copy.routeCard.legend.route}</li>}
            <li><span className="mk mk--known mk--inline" aria-hidden="true" />{copy.routeCard.legend.obstacle}</li>
            <li><span className="pin-mini" aria-hidden="true">?</span>{copy.routeCard.legend.report}</li>
            <li><span className="route-num ow-legend__num" aria-hidden="true">1</span>{copy.routeCard.legend.alert}</li>
          </ul>
        </aside>
      </div>
    </section>
  );
}
