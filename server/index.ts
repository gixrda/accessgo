// Server di produzione: API + frontend compilato (dist/). In sviluppo le stesse API girano dentro Vite (vite.config.ts).
import { createReadStream } from 'node:fs';
import { stat } from 'node:fs/promises';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createApi } from './api.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const dist = join(root, 'dist');
const api = createApi({
  env: process.env,
  reportsFile: join(root, 'server/data/reports.json'),
  osmFile: join(root, 'server/data/osm-pisa.json'),
});
const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.woff2': 'font/woff2',
};

createServer(async (req, res) => {
  if (await api(req, res)) return;
  const rel = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
  let file = join(dist, rel);
  if (!file.startsWith(dist) || !(await stat(file).then((s) => s.isFile(), () => false))) file = join(dist, 'index.html');
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  createReadStream(file).on('error', () => res.end('Esegui prima "npm run build".')).pipe(res);
}).listen(Number(process.env.PORT) || 8787, () => {
  console.log(`OpenWay su http://localhost:${Number(process.env.PORT) || 8787}`);
});
