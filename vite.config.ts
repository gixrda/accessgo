import react from '@vitejs/plugin-react';
import { copyFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin, type UserConfig } from 'vite';
import { createApi } from './server/api.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

// Versione statica della landing per GitHub Pages: `vite build --mode static`.
// Pages non permette header HTTP, quindi la Content Security Policy viaggia come <meta>.
const PAGES_CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com", // stili inline di Leaflet e delle animazioni
  "font-src https://fonts.gstatic.com",
  "img-src 'self' data: https://tile.openstreetmap.org",
  "connect-src 'self' https://nominatim.openstreetmap.org",
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'none'",
  'upgrade-insecure-requests',
].join('; ');

function pagesBuild(): Plugin {
  return {
    name: 'openway-pages',
    apply: 'build',
    transformIndexHtml: (html) => html.replace('<meta charset="UTF-8" />', `<meta charset="UTF-8" />
    <meta http-equiv="Content-Security-Policy" content="${PAGES_CSP}" />
    <meta name="referrer" content="strict-origin-when-cross-origin" />`),
    async closeBundle() {
      // Dati serviti come file (al posto delle API) e landing come pagina iniziale del sito.
      const out = `${root}dist-pages/`;
      await mkdir(`${out}data`, { recursive: true });
      await copyFile(`${root}server/data/osm-pisa.json`, `${out}data/osm-pisa.json`);
      await copyFile(`${root}server/data/routes-recorded.json`, `${out}data/routes-recorded.json`);
      await copyFile(`${out}landing/index.html`, `${out}index.html`);
      await copyFile(`${out}index.html`, `${out}404.html`);
    },
  };
}

export default defineConfig(({ mode }): UserConfig => {
  if (mode === 'static') {
    process.env.VITE_STATIC = '1';
    return {
      base: '/openway/',
      build: { outDir: 'dist-pages', rollupOptions: { input: { landing: `${root}landing/index.html` } } },
      plugins: [react(), pagesBuild()],
    };
  }
  return {
    // Due pagine: l'app su / (link demo ?from=&to=) e la landing su /landing/.
    build: { rollupOptions: { input: { app: `${root}index.html`, landing: `${root}landing/index.html` } } },
    plugins: [
      react(),
      {
        // Le API girano nello stesso processo di Vite: un solo comando (npm run dev) per la demo.
        name: 'openway-api',
        configureServer(server) {
          const api = createApi({
            env: { ...process.env, ...loadEnv(mode, root, '') }, // le chiavi restano lato server, senza prefisso VITE_
            reportsFile: `${root}server/data/reports.json`,
            osmFile: `${root}server/data/osm-pisa.json`,
          });
          server.middlewares.use((req, res, next) => { api(req, res).then((handled) => handled || next(), next); });
        },
      },
    ],
  };
});
