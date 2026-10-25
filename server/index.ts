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
  '.svg': 'image/svg+xml', '.png': 'image/png', '.jpg': 'image/jpeg', '.json': 'application/json', '.woff2': 'font/woff2',
};

// Header di sicurezza per le pagine e i file statici. Il browser parla solo con questo server e con le tile OSM.
const SECURITY_HEADERS: Record<string, string> = {
  'Content-Security-Policy': [
    "default-src 'self'", "script-src 'self'", "style-src 'self' 'unsafe-inline'",
    "font-src 'self'", "img-src 'self' data: blob: https://tile.openstreetmap.org", "connect-src 'self'",
    "object-src 'none'", "base-uri 'self'", "form-action 'self'", "frame-ancestors 'none'",
  ].join('; '),
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'geolocation=(self), microphone=(self), camera=(), payment=(), usb=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
};

createServer(async (req, res) => {
  try {
    if (await api(req, res)) return;
    const rel = normalize(decodeURIComponent(new URL(req.url ?? '/', 'http://x').pathname)).replace(/^(\.\.[/\\])+/, '');
    let file = join(dist, rel);
    if (/[/\\]$/.test(rel)) file = join(file, 'index.html'); // /landing/ → dist/landing/index.html
    else if (file.startsWith(dist) && await stat(file).then((s) => s.isDirectory(), () => false)) {
      // Destinazione ricostruita dal percorso normalizzato: un "//host" non diventa un redirect verso un altro sito.
      res.writeHead(301, { ...SECURITY_HEADERS, Location: `/${rel.replace(/\\/g, '/').replace(/^\/+/, '')}/` }); // /landing → /landing/
      res.end();
      return;
    }
    if (!file.startsWith(dist) || !(await stat(file).then((s) => s.isFile(), () => false))) file = join(dist, 'index.html');
    res.writeHead(200, { ...SECURITY_HEADERS, 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
    createReadStream(file).on('error', () => res.end('Esegui prima "npm run build".')).pipe(res);
  } catch {
    // Es. URL con codifica % non valida: risposta 400 invece di un'eccezione che fermerebbe il processo.
    if (!res.headersSent) res.writeHead(400, { ...SECURITY_HEADERS, 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Richiesta non valida.');
  }
}).listen(Number(process.env.PORT) || 8787, () => {
  console.log(`OpenWay su http://localhost:${Number(process.env.PORT) || 8787}`);
});
