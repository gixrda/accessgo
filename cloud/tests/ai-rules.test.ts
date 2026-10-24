import { describe, expect, it } from 'vitest';
import { fallbackInterpret } from '../server/ai-rules.ts';

const parse = (description: string) => fallbackInterpret(description, 'Fallback dichiarato.');
const HEIGHT = "Altezza dell'ostacolo";

describe('conservative report rules', () => {
  it.each([
    ['Non ci sono gradini. Il problema è una buca profonda.', 'uneven_surface'],
    ['Non ci sono gradini ma non riesco a passare a causa delle buche.', 'uneven_surface'],
    ['No steps or kerbs. The surface is uneven.', 'uneven_surface'],
    ['Senza gradini, ma con buche.', 'uneven_surface'],
    ['Non riesco a passare: c’è un gradino alto.', 'steps'],
    ['The sidewalk on Via Roma has a high step, and wheelchair users cannot pass.', 'steps'],
    ['Il gradino non è stato rimosso.', 'steps'],
    ['The step has not yet been removed.', 'steps'],
    ['Il gradino è stato rimosso ma c’è ancora un gradino davanti.', 'steps'],
    ['The curb is high and I cannot get over it.', 'kerb'],
    ['The step will be removed tomorrow.', 'steps'],
    ['Il gradino sarà rimosso domani.', 'steps'],
  ])('classifies only current mentions: %s', (input, category) => {
    expect(parse(input)).toMatchObject({ category, severity: 'unknown', engine: 'fallback' });
  });

  it.each([
    'Il gradino è stato rimosso ieri; ora il passaggio è libero.',
    'The step was removed yesterday. The passage is now clear.',
    'Hanno rimosso il gradino.',
    'Non ci sono più gradini.',
  ])('does not turn resolved or absent obstacles into current barriers: %s', (input) => {
    expect(parse(input)).toMatchObject({ category: 'no_obstacle', obstacle: null, severity: 'unknown', summary: input });
  });

  it.each([
    'Il passaggio è largo 90 cm e c’è un gradino.',
    'The step is 90 cm wide.',
    'Il cordolo è alto ma il passaggio è largo 90 cm.',
  ])('does not use width as obstacle height: %s', (input) => {
    expect(parse(input).missing_info).toContain(HEIGHT);
  });

  it.each(['Gradino di 15 cm', 'The step is 15 cm high.', 'Il cordolo è alto 0,15 m.'])('recognises an explicitly linked height: %s', (input) => {
    expect(parse(input).missing_info).not.toContain(HEIGHT);
  });

  it('asks for category confirmation for multiple current obstacle types', () => {
    const input = 'Ci sono un gradino e una buca profonda.';
    expect(parse(input)).toMatchObject({ category: 'unclear', obstacle: null, severity: 'unknown', summary: input, note: expect.stringContaining('controlla manualmente') });
    expect(parse(input).missing_info).toContain('Descrivi l’ostacolo attuale e indica qual è il problema principale');
  });

  it('preserves the original report without inventing a summary, location, or severity', () => {
    const input = '  High step  on Via Roma.\n' + 'Very difficult to pass. '.repeat(12);
    const expected = input.trim().replace(/\s+/g, ' ');
    expect(parse(input)).toMatchObject({ summary: `${expected.slice(0, 157)}…`, severity: 'unknown', engine: 'fallback', note: 'Fallback dichiarato.' });
    expect(parse(input)).not.toHaveProperty('verified');
    expect(parse(input)).not.toHaveProperty('coordinates');
  });

  it('retains unknown category when the report has no recognised physical obstacle', () => {
    expect(parse('Non riesco a passare qui.')).toMatchObject({ category: 'unclear', obstacle: null, severity: 'unknown' });
    expect(parse('Un gradino di 15 cm e un altro gradino.').missing_info).toContain(HEIGHT);
  });

  it.each(['Non ci sono ostacoli.', 'Il passaggio è libero.', 'There are no obstacles.', 'Non vedo ostacoli.'])('separates explicit absence from uncertainty: %s', (input) => {
    expect(parse(input)).toMatchObject({ category: 'no_obstacle', obstacle: null, severity: 'unknown', missing_info: [] });
  });

  it.each(['Non so se ci sia un gradino.', 'Forse c’è una buca.', 'Maybe there is a step.', 'Non sono sicuro che ci sia un gradino.', 'Non è vero che il passaggio è libero.', 'Non ci sono gradini, ma non riesco a passare.', 'Il gradino è stato rimosso, ma il fondo è scivoloso.'])('does not infer absence or a specific obstacle from uncertainty: %s', (input) => {
    expect(parse(input)).toMatchObject({ category: 'unclear', obstacle: null, severity: 'unknown' });
    expect(parse(input).missing_info.length).toBeGreaterThan(0);
  });

  it('uses other only for an identifiable obstacle outside the named categories', () => {
    expect(parse('Il portone è troppo pesante da aprire.')).toMatchObject({ category: 'other', obstacle: 'portone è troppo pesante' });
    expect(parse('Non capisco cosa succede qui.').category).toBe('unclear');
  });
});
