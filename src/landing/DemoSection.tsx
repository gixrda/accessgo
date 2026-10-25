import type L from 'leaflet';
import { useEffect, useState } from 'react';
import type { OsmFeature, Report } from '../../shared/types.ts';
import { Icon } from '../components/Icon.tsx';
import { formatDistance, formatDuration } from '../lib/analysis.ts';
import { verdictOf } from '../lib/verdict.ts';
import { APP_URL, copy, type Scenario } from './copy.ts';
import { LandingMap } from './LandingMap.tsx';
import { STATIC } from './staticData.ts';
import { PinnedTitle } from './PinnedTitle.tsx';
import { useAlerts, useRoute } from './useLanding.ts';

const t = copy.demo;
const MAX_ALERTS = 5;
const appLink = (s: Scenario) => `${APP_URL}?from=${s.from.join(',')}&to=${s.to.join(',')}`;

export function DemoSection({ features, reports }: { features: OsmFeature[]; reports: Report[] }) {
  const [scenario, setScenario] = useState<Scenario>(t.scenarios[0]);
  const [attempt, setAttempt] = useState(0);
  const [map, setMap] = useState<L.Map | null>(null);
  const state = useRoute(scenario, attempt);
  const route = state.status === 'ready' ? state.route : null;
  const alerts = useAlerts(route, features, reports);
  const verdict = route ? verdictOf(route, alerts) : null;

  useEffect(() => {
    if (!map) return;
    const coords = route?.coords.length ? route.coords : [scenario.from, scenario.to];
    map.fitBounds(coords, { padding: [40, 40], maxZoom: 18, animate: false });
  }, [map, route, scenario]);

  return (
    <section id="demo" className="ow-section ow-demo" aria-labelledby="ow-demo-title">
      <div className="ow-container">
        <header className="ow-demo__head" data-reveal>
          <h2 id="ow-demo-title" className="ow-h1"><PinnedTitle text={t.title} icon="route" /></h2>
          <p className="ow-lead">{t.lead}</p>
        </header>

        <div className="ow-demo__body">
          <fieldset className="ow-demo__picker" data-reveal>
            <legend className="ow-demo__legend">{t.pick}</legend>
            {t.scenarios.map((s) => (
              <label key={s.id} className="ow-scenario">
                <input type="radio" name="ow-scenario" value={s.id} checked={s.id === scenario.id} onChange={() => setScenario(s)} />
                <span className="ow-scenario__name">{s.name}</span>
                <span className="ow-scenario__hint">{s.hint}</span>
              </label>
            ))}
          </fieldset>

          <div className="ow-demo__stage" data-reveal>
            <LandingMap mapRef={setMap} label={`${t.mapLabel}: ${scenario.name}`} className="ow-demo__map"
              features={features} reports={reports} route={route} alerts={alerts} zoom={17} />

            <div className="ow-demo__result" aria-live="polite">
              {state.status === 'loading' || state.status === 'idle' ? (
                <p className="ow-routecard__state"><span className="ow-spinner" aria-hidden="true" />{t.loading}</p>
              ) : state.status === 'error' ? (
                <div className="ow-demo__error">
                  <p className="ow-routecard__state is-error"><Icon name="warning" size={16} />{t.error}</p>
                  <button type="button" className="ow-btn ow-btn--secondary" onClick={() => setAttempt((n) => n + 1)}>{t.retry}</button>
                </div>
              ) : verdict && route && (
                <>
                  <div className={`ow-verdict ow-verdict--${verdict.tone}`}>
                    <p className="ow-verdict__title"><Icon name={verdict.tone === 'warn' ? 'warning' : 'check'} size={16} />{verdict.title}</p>
                    <p className="ow-verdict__meta">{formatDistance(route.distanceM)}{route.durationS ? ` · circa ${formatDuration(route.durationS)}` : ''}</p>
                    {route.safety?.choice && <p className="ow-verdict__text">{route.safety.choice}</p>}
                    {(!route.safety?.verifiable || route.mode !== 'wheelchair') && <p className="ow-verdict__text">{verdict.text}</p>}
                  </div>
                  <h3 className="ow-demo__alerts-title">{t.alertsTitle}</h3>
                  {alerts.length ? (
                    <ol className="ow-alerts">
                      {alerts.slice(0, MAX_ALERTS).map((a, i) => (
                        <li key={a.key}>
                          <span className="route-num" aria-hidden="true">{i + 1}</span>
                          <span className="ow-alerts__text"><strong>{a.title}</strong>{a.detail && <span>{a.detail}</span>}</span>
                          <span className="ow-alerts__at">{t.at(formatDistance(a.alongM))}</span>
                        </li>
                      ))}
                    </ol>
                  ) : <p className="ow-demo__none">{t.noAlerts}</p>}
                  {alerts.length > MAX_ALERTS && <p className="ow-alerts__more">{t.more(alerts.length - MAX_ALERTS)}</p>}
                </>
              )}
              {state.status === 'ready' && state.recordedAt && <p className="ow-demo__none">{copy.routeCard.recorded(new Date(state.recordedAt).toLocaleDateString('it-IT'))}</p>}
              {!STATIC && <a className="ow-btn ow-btn--primary ow-demo__open" href={appLink(scenario)}>{t.open}</a>}
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
