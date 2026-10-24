/** Errore con messaggio già comprensibile per l'utente (mai dettagli tecnici o credenziali). */
export class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

export type Env = Record<string, string | undefined>;

export const USER_AGENT = 'OpenWay-hackathon/0.1 (prototipo accessibilità Pisa)';
