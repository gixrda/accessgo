import { env } from 'cloudflare:workers';
import { getChatGPTUser } from '../../chatgpt-auth';
import { createCloudApi } from '../../../server/cloud-api';
import osmData from '../../../server/data/osm-pisa.json';
import type { OsmDataset } from '../../../shared/types';

/** Credentials stay in the Worker bindings; only capability booleans reach the UI. */
function handle(request: Request) {
  return createCloudApi({
    env: {
      ORS_API_KEY: env.ORS_API_KEY,
      GEMINI_API_KEY: env.GEMINI_API_KEY,
      GEMMA_MODEL: env.GEMMA_MODEL,
      ADMIN_TOKEN: env.ADMIN_TOKEN,
      NOMINATIM_SEARCH_URL: env.NOMINATIM_SEARCH_URL,
    },
    db: env.DB,
    osm: osmData as unknown as OsmDataset,
    getUserId: async () => (await getChatGPTUser())?.userId ?? null,
  })(request);
}

export const GET = handle;
export const POST = handle;
export const PATCH = handle;
