import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';
import { createApi } from './server/api.ts';

const root = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => ({
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
}));
