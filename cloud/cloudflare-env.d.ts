declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    ORS_API_KEY?: string;
    GEMINI_API_KEY?: string;
    GEMMA_MODEL?: string;
    ELEVENLABS_API_KEY?: string;
    ELEVENLABS_VOICE_ID?: string;
    ELEVENLABS_TTS_MODEL?: string;
    ADMIN_TOKEN?: string;
    NOMINATIM_SEARCH_URL?: string;
  }
}
