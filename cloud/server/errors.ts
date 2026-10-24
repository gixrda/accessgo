/** Errore con messaggio già comprensibile per l'utente (mai dettagli tecnici o credenziali). */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Env = Record<string, string | undefined> & {
  ELEVENLABS_API_KEY?: string;
  ELEVENLABS_VOICE_ID?: string;
  ELEVENLABS_TTS_MODEL?: string;
};

export const USER_AGENT = 'AccessGo/0.2 (+https://accessgo-pisa-marco.xyxzwb.chatgpt.site)';
