// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { PlaceField } from '../src/components/PlaceField.tsx';
import { api } from '../src/api.ts';
import type { GeocodeResult } from '../shared/types.ts';

vi.mock('../src/api.ts', () => ({ api: { geocode: vi.fn() } }));
const result = { label: 'Via Roma, 10, Pisa, Toscana, Italia', lat: 43.719, lng: 10.395 };
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (e: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}
function setup() {
  const onSet = vi.fn(), onPick = vi.fn();
  const view = render(<PlaceField letter="A" label="Partenza" value={null} picking={false} onSet={onSet} onPick={onPick} />);
  return { ...view, onSet, onPick };
}
function type(q: string) { fireEvent.change(screen.getByRole('searchbox'), { target: { value: q } }); }
function submit() { fireEvent.submit(screen.getByRole('search', { name: 'Cerca partenza' })); }
beforeEach(() => { vi.resetAllMocks(); });
afterEach(cleanup);

describe('explicit address search', () => {
  it('does not autocomplete while typing, then displays real candidate labels and preserves the full address', async () => {
    const { onSet } = setup();
    vi.mocked(api.geocode).mockResolvedValue([result]);
    type('  Via   Roma 10  ');
    expect(api.geocode).not.toHaveBeenCalled();
    await act(async () => submit());
    expect(api.geocode).toHaveBeenCalledWith('Via Roma 10', expect.any(AbortSignal));
    fireEvent.click(screen.getByRole('button', { name: result.label }));
    expect(onSet).toHaveBeenCalledWith(result);
  });
  it('shows incomplete-query guidance as status rather than a service error', async () => {
    setup(); vi.mocked(api.geocode).mockResolvedValue([]);
    type('piazza'); await act(async () => submit());
    expect(screen.getByRole('status').textContent).toContain('troppo generico');
    expect(screen.queryByRole('alert')).toBeNull();
  });
  it('lists local OSM candidates for a generic query without claiming exact entrances', async () => {
    setup();
    const local = { ...result, label: 'Piazza dei Cavalieri — punto indicativo da OSM locale' };
    vi.mocked(api.geocode).mockResolvedValue([local]);
    type('piazza'); await act(async () => submit());
    expect(screen.getByRole('button', { name: local.label })).toBeTruthy();
    expect(screen.getByText(/non identificano un ingresso accessibile/)).toBeTruthy();
  });
  it('distinguishes unavailable service from a successful empty search and allows retry', async () => {
    setup();
    vi.mocked(api.geocode).mockRejectedValueOnce(new Error('Ricerca temporaneamente non disponibile.')).mockResolvedValueOnce([]);
    type('Via Inesistente 123'); await act(async () => submit());
    expect(screen.getByRole('alert').textContent).toContain('temporaneamente');
    await act(async () => submit());
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('status').textContent).toContain('Nessun risultato');
  });
  it('aborts an obsolete query and ignores its late success even when fetch ignores abort', async () => {
    setup(); const old = deferred<GeocodeResult[]>(), next = deferred<GeocodeResult[]>();
    vi.mocked(api.geocode).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    type('piazza'); submit();
    const signal = vi.mocked(api.geocode).mock.calls[0][1]!;
    type('Via Roma 10'); submit();
    expect(signal.aborted).toBe(true);
    await act(async () => next.resolve([result]));
    await act(async () => old.resolve([{ ...result, label: 'Vecchio risultato' }]));
    expect(screen.queryByRole('button', { name: 'Vecchio risultato' })).toBeNull();
    expect(screen.getByRole('button', { name: result.label })).toBeTruthy();
  });
  it('does not replace a new search with a stale error or finish its loading state early', async () => {
    setup(); const old = deferred<GeocodeResult[]>(), next = deferred<GeocodeResult[]>();
    vi.mocked(api.geocode).mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);
    type('piazza'); submit(); type('Via Roma'); submit();
    await act(async () => old.reject(new Error('Vecchio errore')));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(screen.getByRole('button', { name: 'Cerco…' })).toBeTruthy();
    await act(async () => next.resolve([result]));
    expect(screen.getByRole('button', { name: result.label })).toBeTruthy();
  });
  it('invalidates search when the user switches to map selection', async () => {
    const { onPick } = setup(); const pending = deferred<GeocodeResult[]>();
    vi.mocked(api.geocode).mockReturnValue(pending.promise);
    type('Via Roma'); submit();
    const signal = vi.mocked(api.geocode).mock.calls[0][1]!;
    fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
    expect(onPick).toHaveBeenCalledOnce(); expect(signal.aborted).toBe(true);
    await act(async () => pending.resolve([result]));
    expect(screen.queryByRole('button', { name: result.label })).toBeNull();
  });
  it('cancels search on unmount', () => {
    const { unmount } = setup();
    vi.mocked(api.geocode).mockReturnValue(new Promise(() => {}));
    type('Via Roma'); submit(); const signal = vi.mocked(api.geocode).mock.calls[0][1]!;
    unmount(); expect(signal.aborted).toBe(true);
  });
});
