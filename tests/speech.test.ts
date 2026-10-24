import { describe, expect, it } from 'vitest';
import { spokenPlaceQuery } from '../src/lib/speech.ts';

describe('spokenPlaceQuery', () => {
  it.each([
    ['Portami in Piazza dei Cavalieri.', 'Piazza dei Cavalieri'],
    ['Cerca il percorso per la stazione', 'la stazione'],
    ['Voglio andare alla Torre di Pisa, per favore', 'Torre di Pisa'],
    ['Via Santa Maria 26', 'Via Santa Maria 26'],
    ['Partenza da Piazza Garibaldi', 'Piazza Garibaldi'],
    ['  piazza dante  ', 'piazza dante'],
  ])('%s → %s', (said, query) => {
    expect(spokenPlaceQuery(said)).toBe(query);
  });
});
