// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { VoiceRoutePanel } from '../src/components/VoiceRoutePanel.tsx';
import { api } from '../src/api.ts';
import type { RouteIntent } from '../shared/routeIntent.ts';

vi.mock('../src/api.ts', () => ({ api: { interpretRoute: vi.fn(), geocode: vi.fn() } }));
vi.mock('../src/components/DictationButton.tsx', () => ({ DictationButton: ({ label, onTranscript, onRecordingStart, language, autoPrepare }: {
  label: string; onTranscript: (text: string) => void; onRecordingStart?: () => void; language?: string; autoPrepare?: boolean;
}) => <div>
  <button onClick={() => { onRecordingStart?.(); onTranscript('Portami alla Torre di Pisa dalla mia posizione.'); }}>{label}</button>
  <button onClick={() => onRecordingStart?.()}>Start recording only</button>
  <span>{language === 'auto' && autoPrepare ? 'Auto language with preparation' : 'Wrong dictation options'}</span>
</div> }));
const routeIntent: RouteIntent = {
  intent: 'route', origin: { query: 'Piazza dei Cavalieri', evidence: 'Piazza dei Cavalieri' },
  destination: { query: 'Torre di Pisa', evidence: 'Torre di Pisa' }, via: [],
  useCurrentLocation: false, clarification: null, engine: 'gemma', model: 'gemma-test',
};
const a = { lat: 43.719, lng: 10.4, label: 'Piazza dei Cavalieri, Pisa' };
const b = { lat: 43.72, lng: 10.402, label: 'Via Roma, Pisa' };
const c = { lat: 43.723, lng: 10.397, label: 'Torre di Pisa, Piazza del Duomo' };
let getCurrentPosition: ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.useFakeTimers(); vi.setSystemTime(1_000_000); vi.resetAllMocks();
  vi.stubGlobal('isSecureContext', true);
  getCurrentPosition = vi.fn();
  Object.defineProperty(navigator, 'geolocation', { configurable: true, value: { getCurrentPosition } });
  vi.mocked(api.interpretRoute).mockResolvedValue(routeIntent);
  vi.mocked(api.geocode).mockImplementation(async (query) => query.includes('Cavalieri') ? [a] : query.includes('Roma') ? [b] : [c]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.useRealTimers(); });
async function typeAndPrepare() {
  fireEvent.change(screen.getByRole('textbox', { name: 'La tua richiesta' }), { target: { value: 'Da Piazza dei Cavalieri alla Torre di Pisa' } });
  await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prepara percorso' })));
}
async function finishSearches() { await act(async () => { await vi.runAllTimersAsync(); }); }
const select = (label: string, index = '0') => fireEvent.change(screen.getByRole('combobox', { name: `Scegli ${label}` }), { target: { value: index } });

describe('voice-assisted route planning with explicit location review', () => {
  it('transcription fills the text and prepares a route automatically without using GPS', async () => {
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Parla per pianificare' })));
    expect(api.interpretRoute).toHaveBeenCalledExactlyOnceWith('Portami alla Torre di Pisa dalla mia posizione.', expect.any(AbortSignal));
    expect((screen.getByRole('textbox', { name: 'La tua richiesta' }) as HTMLTextAreaElement).value).toContain('Portami alla Torre');
    expect(screen.getByText('Auto language with preparation')).toBeTruthy();
    await finishSearches();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(screen.getByText('Interpretata da Gemma · gemma-test')).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conferma e calcola percorso' }).hasAttribute('disabled')).toBe(true);
  });

  it('accepts an external top-search request once without duplicating microphone or text inputs', async () => {
    const onApply = vi.fn();
    const onRequestConsumed = vi.fn();
    const { rerender } = render(<VoiceRoutePanel onApply={onApply} compact externalRequest={{ id: 1, text: 'Torre di Pisa' }} onRequestConsumed={onRequestConsumed} />);
    await finishSearches();
    expect(api.interpretRoute).toHaveBeenCalledExactlyOnceWith('Torre di Pisa', expect.any(AbortSignal));
    expect(onRequestConsumed).toHaveBeenCalledOnce();
    expect(screen.queryByRole('textbox', { name: 'La tua richiesta' })).toBeNull();
    expect(screen.queryByRole('button', { name: 'Parla per pianificare' })).toBeNull();
    rerender(<VoiceRoutePanel onApply={onApply} compact externalRequest={{ id: 1, text: 'Torre di Pisa' }} />);
    await finishSearches();
    expect(api.interpretRoute).toHaveBeenCalledTimes(1);
    rerender(<VoiceRoutePanel onApply={onApply} compact externalRequest={{ id: 2, text: 'Via Roma' }} />);
    await finishSearches();
    expect(api.interpretRoute).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.interpretRoute).mock.calls[1][0]).toBe('Via Roma');
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('keeps the initial compact panel small and waits for the top search', () => {
    render(<VoiceRoutePanel onApply={vi.fn()} compact />);
    expect(screen.queryByText('Pianifica con la voce o la ricerca in alto.')).toBeNull();
    expect(screen.queryByRole('textbox')).toBeNull();
    expect(screen.queryByRole('button', { name: 'Parla per pianificare' })).toBeNull();
    expect(api.interpretRoute).not.toHaveBeenCalled();
  });

  it('typed requests resolve places sequentially, never preselect candidates, and preserve stop order', async () => {
    const onApply = vi.fn();
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, via: [{ query: 'Via Roma', evidence: 'Via Roma' }] });
    const callTimes: number[] = [];
    vi.mocked(api.geocode).mockImplementation(async (query) => {
      callTimes.push(Date.now()); return query.includes('Cavalieri') ? [a] : query.includes('Roma') ? [b] : [c];
    });
    render(<VoiceRoutePanel onApply={onApply} />);
    await typeAndPrepare(); await finishSearches();
    expect(vi.mocked(api.geocode).mock.calls.map(([query]) => query)).toEqual(['Piazza dei Cavalieri', 'Via Roma', 'Torre di Pisa']);
    expect(callTimes[1] - callTimes[0]).toBeGreaterThanOrEqual(2300);
    expect(callTimes[2] - callTimes[1]).toBeGreaterThanOrEqual(2300);
    expect(onApply).not.toHaveBeenCalled();
    select('partenza'); select('destinazione');
    expect(screen.getByRole('button', { name: 'Conferma e calcola percorso' }).hasAttribute('disabled')).toBe(true);
    select('tappa 1');
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' }));
    expect(onApply).toHaveBeenCalledExactlyOnceWith({ from: a, via: [b], to: c });
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it('requires an explicit choice between ambiguous candidates', async () => {
    const second = { ...c, lat: 43.7228, label: 'Altro ingresso in Piazza del Duomo' };
    const onApply = vi.fn();
    vi.mocked(api.geocode).mockImplementation(async (query) => query.includes('Cavalieri') ? [a] : [c, second]);
    render(<VoiceRoutePanel onApply={onApply} />);
    await typeAndPrepare(); await finishSearches(); select('partenza');
    expect(screen.getByRole('option', { name: second.label })).toBeTruthy();
    expect(screen.getByRole('button', { name: 'Conferma e calcola percorso' }).hasAttribute('disabled')).toBe(true);
    select('destinazione', '1'); fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' }));
    expect(onApply).toHaveBeenCalledWith({ from: a, via: [], to: second });
  });

  it('keeps the GPS button disabled while geocoding so destination lookup is not cancelled', async () => {
    let resolve!: (value: typeof c[]) => void;
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, origin: null, useCurrentLocation: true });
    vi.mocked(api.geocode).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await typeAndPrepare();
    await act(async () => vi.advanceTimersByTimeAsync(0));
    const gps = screen.getByRole('button', { name: 'Usa la mia posizione' });
    expect(gps.hasAttribute('disabled')).toBe(true);
    fireEvent.click(gps);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(vi.mocked(api.geocode).mock.calls[0][1]?.aborted).toBe(false);
    await act(async () => resolve([c]));
    expect(screen.getByRole('option', { name: c.label })).toBeTruthy();
    expect(gps.hasAttribute('disabled')).toBe(false);
    fireEvent.click(gps);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('collapses a confirmed proposal so the route output remains visible, and can start a new request', async () => {
    const onApply = vi.fn();
    render(<VoiceRoutePanel onApply={onApply} />);
    await typeAndPrepare(); await finishSearches(); select('partenza'); select('destinazione');
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' }));
    expect(screen.getByRole('heading', { name: 'Percorso impostato' })).toBeTruthy();
    expect(screen.queryByRole('textbox', { name: 'La tua richiesta' })).toBeNull();
    expect(screen.queryByText('Conferma i luoghi')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Nuova richiesta vocale' }));
    expect(screen.getByRole('button', { name: 'Parla per pianificare' })).toBeTruthy();
    expect((screen.getByRole('textbox', { name: 'La tua richiesta' }) as HTMLTextAreaElement).value).toBe('');
    expect(onApply).toHaveBeenCalledOnce();
  });

  it('handles browsers that throw synchronously when requesting GPS', async () => {
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, origin: null, useCurrentLocation: true });
    getCurrentPosition.mockImplementation(() => { throw new DOMException('blocked', 'SecurityError'); });
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await typeAndPrepare(); await finishSearches();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Usa la mia posizione' })));
    expect(screen.getByRole('alert').textContent).toContain('scrivere un indirizzo');
    expect(screen.getByRole('button', { name: 'Usa la mia posizione' }).hasAttribute('disabled')).toBe(false);
  });

  it('displays clarification and truthful fallback attribution instead of guessing an itinerary', async () => {
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, intent: 'unclear', origin: null, destination: null, engine: 'fallback', clarification: 'Quale luogo vuoi raggiungere?' });
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await typeAndPrepare(); await finishSearches();
    expect(screen.getByText('Quale luogo vuoi raggiungere?')).toBeTruthy();
    expect(screen.getByText('Interpretazione a regole · Gemma non utilizzato')).toBeTruthy();
    expect(api.geocode).not.toHaveBeenCalled();
    expect(screen.queryByRole('button', { name: 'Conferma e calcola percorso' })).toBeNull();
    expect(getCurrentPosition).not.toHaveBeenCalled();
  });

  it.each(['denied', 'outside', 'imprecise'])('requests origin GPS only on click and handles %s with a manual alternative', async (reason) => {
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, origin: null, useCurrentLocation: true });
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await typeAndPrepare(); await finishSearches();
    expect(getCurrentPosition).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Usa la mia posizione' }));
    const [success, failure] = getCurrentPosition.mock.calls[0];
    await act(async () => {
      if (reason === 'denied') failure({ code: 1 });
      else success({ coords: { latitude: reason === 'outside' ? 0 : 43.72, longitude: 10.4, accuracy: reason === 'imprecise' ? 1500 : 5 }, timestamp: Date.now() });
    });
    expect(screen.getByRole('alert').textContent).toMatch(/indirizzo/);
    expect(screen.getByRole('searchbox', { name: 'A · Partenza' })).toBeTruthy();
  });

  it('accepts a precise explicit GPS origin and confirms the itinerary without starting live navigation', async () => {
    const onApply = vi.fn();
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, origin: null, useCurrentLocation: true });
    render(<VoiceRoutePanel onApply={onApply} />);
    await typeAndPrepare(); await finishSearches();
    fireEvent.click(screen.getByRole('button', { name: 'Usa la mia posizione' }));
    await act(async () => getCurrentPosition.mock.calls[0][0]({ coords: { latitude: a.lat, longitude: a.lng, accuracy: 5 }, timestamp: Date.now() }));
    select('destinazione'); fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' }));
    expect(onApply).toHaveBeenCalledWith({ from: { ...a, label: 'La mia posizione' }, via: [], to: c });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('requires explicit confirmation before using an approximate location', async () => {
    const onApply = vi.fn();
    vi.mocked(api.interpretRoute).mockResolvedValue({ ...routeIntent, origin: null, useCurrentLocation: true });
    render(<VoiceRoutePanel onApply={onApply} />);
    await typeAndPrepare(); await finishSearches();
    fireEvent.click(screen.getByRole('button', { name: 'Usa la mia posizione' }));
    await act(async () => getCurrentPosition.mock.calls[0][0]({ coords: { latitude: a.lat, longitude: a.lng, accuracy: 350 }, timestamp: Date.now() }));
    select('destinazione');
    expect(screen.getByText(/Posizione approssimativa/).textContent).toContain('350');
    expect(screen.getByRole('button', { name: 'Conferma e calcola percorso' }).hasAttribute('disabled')).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Conferma posizione approssimativa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Conferma e calcola percorso' }));
    expect(onApply).toHaveBeenCalledWith({ from: { lat: a.lat, lng: a.lng, label: 'La mia posizione (circa 350 m)' }, via: [], to: c });
  });

  it('ignores stale interpretation after typing or starting a new recording', async () => {
    let resolve!: (value: RouteIntent) => void;
    vi.mocked(api.interpretRoute).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await typeAndPrepare();
    const signal = vi.mocked(api.interpretRoute).mock.calls[0][1]!;
    fireEvent.change(screen.getByRole('textbox', { name: 'La tua richiesta' }), { target: { value: 'Una richiesta diversa' } });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve(routeIntent));
    expect(screen.queryByText('Conferma i luoghi')).toBeNull();
    expect(api.geocode).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Prepara percorso' })));
    fireEvent.click(screen.getByRole('button', { name: 'Start recording only' }));
    expect(vi.mocked(api.interpretRoute).mock.calls[1][1]?.aborted).toBe(true);
  });

  it('ignores stale geocodes and GPS callbacks after editing or cancelling', async () => {
    let resolve!: (value: typeof a[]) => void;
    vi.mocked(api.geocode).mockReturnValue(new Promise((done) => { resolve = done; }));
    render(<VoiceRoutePanel onApply={vi.fn()} />);
    await typeAndPrepare(); await act(async () => vi.advanceTimersByTimeAsync(0));
    fireEvent.change(screen.getByRole('searchbox', { name: 'A · Partenza' }), { target: { value: 'Via Roma' } });
    await act(async () => resolve([a]));
    expect(screen.queryByRole('option', { name: a.label })).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'Usa la mia posizione' }));
    const callback = getCurrentPosition.mock.calls[0][0];
    fireEvent.click(screen.getByRole('button', { name: 'Annulla preparazione' }));
    await act(async () => callback({ coords: { latitude: a.lat, longitude: a.lng, accuracy: 5 }, timestamp: Date.now() }));
    expect(screen.queryByText('✓ La mia posizione')).toBeNull();
    expect(screen.queryByText('Conferma i luoghi')).toBeNull();
  });
});
