// Registra i percorsi dei tragitti demo per la landing statica (GitHub Pages), dove non c'è un server.
// Uso: npm run record:routes  (5 richieste, una alla volta, ai servizi pubblici di routing)
// Il file salvato è quello che il server restituisce davvero: se Valhalla non risponde, il ripiego a piedi resta dichiarato.
import { writeFile } from 'node:fs/promises';
import type { RouteResult } from '../shared/types.ts';
import { getRoute } from '../server/routing.ts';
import { copy } from '../src/landing/copy.ts';

const routes: Record<string, RouteResult> = {};
for (const s of copy.demo.scenarios) {
  const route = await getRoute({ lat: s.from[0], lng: s.from[1] }, { lat: s.to[0], lng: s.to[1] }, {});
  routes[`${s.from.join(',')}|${s.to.join(',')}`] = route;
  console.log(`${s.name}: ${route.mode} (${route.provider}), ${Math.round(route.distanceM)} m`);
}
await writeFile(new URL('../server/data/routes-recorded.json', import.meta.url), JSON.stringify({ recordedAt: new Date().toISOString(), routes }));
