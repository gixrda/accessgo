// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Report, RouteResult } from '../shared/types.ts';
import App from '../src/App.tsx';
import { api } from '../src/api.ts';
import type { Focus, PickMode, Selection } from '../src/components/MapView.tsx';
import { readReportSignInDraft } from '../src/lib/reportSession.ts';

vi.mock('../src/api.ts', () => ({
  api: { status: vi.fn(), osm: vi.fn(), reports: vi.fn(), createReport: vi.fn(), route: vi.fn(), geocode: vi.fn(), setStatus: vi.fn() },
}));

// The real form, draft hook, navigation, details and submit portal remain mounted by App.
// Only map rendering is replaced: these buttons simulate a map pick and an existing report marker.
vi.mock('../src/components/MapView.tsx', () => ({
  MapView: ({ onPick, onSelect, reports, pickMode, focus, route }: {
    onPick: (point: { lat: number; lng: number }) => void;
    onSelect: (selection: Selection) => void;
    reports: Report[];
    pickMode: PickMode;
    focus: Focus;
    route: RouteResult | null;
  }) => (
    <div>
      <button onClick={() => onPick(point)}>Seleziona punto di prova</button>
      <button onClick={() => onPick(destination)}>Seleziona destinazione di prova</button>
      <button onClick={() => onSelect({ type: 'report', report: savedReport })}>Apri dettaglio di prova</button>
      <output aria-label="Numero segnalazioni">{reports.length}</output>
      <output aria-label="Modalità selezione">{pickMode ?? 'none'}</output>
      <output aria-label="Centro richiesto">{JSON.stringify(focus)}</output>
      <output aria-label="Percorso visualizzato">{JSON.stringify(route?.coords ?? null)}</output>
    </div>
  ),
}));

const point = { lat: 43.72, lng: 10.4 };
const destination = { lat: 43.721, lng: 10.401 };
const description = 'Gradino alto sul marciapiede davanti alla biblioteca.';
const savedReport: Report = {
  id: 'report-test', ...point, description, category: 'steps', categorySource: 'user',
  source: 'user_report', status: 'unverified', createdAt: '2026-10-24T10:00:00Z',
  interpretation: { category: 'steps', obstacle: 'Gradino', summary: description, severity: 'high', missing_info: [], engine: 'fallback' },
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ matches: true, media, addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'fallback', admin: false });
  vi.mocked(api.osm).mockResolvedValue({ source: 'test fixture', fetchedAt: '2026-10-24T10:00:00Z', bbox: [43.7, 10.3, 43.8, 10.5], features: [] });
  vi.mocked(api.reports).mockResolvedValue([]);
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function renderApp() {
  await act(async () => { render(<App />); });
}

function switchTab(name: 'Segnala' | 'Percorso') {
  fireEvent.click(screen.getByRole('button', { name }));
}

function fillReport() {
  switchTab('Segnala');
  fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
  fireEvent.click(screen.getByRole('button', { name: 'Seleziona punto di prova' }));
  fireEvent.change(screen.getByRole('textbox', { name: /Cosa hai trovato/ }), { target: { value: description } });
  fireEvent.change(screen.getByRole('combobox', { name: /Categoria/ }), { target: { value: 'steps' } });
}

function expectDraft() {
  expect((screen.getByRole('textbox', { name: /Cosa hai trovato/ }) as HTMLTextAreaElement).value).toBe(description);
  expect((screen.getByRole('combobox', { name: /Categoria/ }) as HTMLSelectElement).value).toBe('steps');
  expect(screen.getByText('Punto selezionato · 43.72000, 10.40000')).toBeTruthy();
}

describe('report draft across actual App navigation', () => {
  it('keeps anonymous browsing public and preserves a report across the sign-in round trip', async () => {
    vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'fallback', admin: false,
      reportRequiresSignIn: true, reportSignedIn: false });
    await renderApp();
    expect(screen.getByRole('heading', { name: 'Trova un percorso' })).toBeTruthy();
    fillReport();
    const signIn = screen.getByRole('link', { name: 'Accedi per inviare' });
    expect(signIn.getAttribute('href')).toBe('/signin-with-chatgpt?return_to=%2F');
    expect(signIn.getAttribute('target')).toBe('_top');
    expect(screen.queryByRole('button', { name: 'Invia segnalazione' })).toBeNull();
    fireEvent.submit(document.getElementById('report-form')!);
    expect(api.createReport).not.toHaveBeenCalled();
    signIn.addEventListener('click', (event) => event.preventDefault());
    fireEvent.click(signIn);
    expect(readReportSignInDraft()).toEqual({ point, description, category: 'steps' });

    cleanup();
    vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'fallback', admin: false,
      reportRequiresSignIn: true, reportSignedIn: true });
    vi.mocked(api.createReport).mockResolvedValue(savedReport);
    await renderApp();
    expectDraft();
    expect(screen.queryByRole('link', { name: 'Accedi per inviare' })).toBeNull();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Invia segnalazione' })));
    expect(api.createReport).toHaveBeenCalledExactlyOnceWith({ ...point, description, category: 'steps' });
    expect(readReportSignInDraft()).toBeNull();
    expect(screen.getByRole('heading', { name: 'Segnalazione inviata' })).toBeTruthy();
  });

  it('preserves description, category and point across route tabs and map detail round trips', async () => {
    await renderApp();
    fillReport();
    switchTab('Percorso');
    expect(screen.queryByRole('textbox', { name: /Cosa hai trovato/ })).toBeNull();
    switchTab('Segnala');
    expectDraft();

    fireEvent.click(screen.getByRole('button', { name: 'Apri dettaglio di prova' }));
    expect(screen.getByRole('region', { name: "Dettagli dell'elemento selezionato" })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: /Indietro/ }));
    expectDraft();
    expect(api.createReport).not.toHaveBeenCalled();
  });

  it('keeps a pending submission locked across tab changes and prevents duplicate requests', async () => {
    const request = deferred<Report>();
    vi.mocked(api.createReport).mockReturnValue(request.promise);
    await renderApp();
    fillReport();
    const submit = screen.getByRole('button', { name: 'Invia segnalazione' }) as HTMLButtonElement;
    // The fixed action lives outside the scrolling form and must still submit that form.
    expect(submit.closest('form')).toBeNull();
    expect(submit.form?.id).toBe('report-form');
    fireEvent.click(submit);
    expect(api.createReport).toHaveBeenCalledExactlyOnceWith({ ...point, description, category: 'steps' });

    switchTab('Percorso');
    switchTab('Segnala');
    expectDraft();
    expect((screen.getByRole('textbox', { name: /Cosa hai trovato/ }) as HTMLTextAreaElement).disabled).toBe(true);
    expect((screen.getByRole('combobox', { name: /Categoria/ }) as HTMLSelectElement).disabled).toBe(true);
    const pendingButton = screen.getByRole('button', { name: 'Invio e interpretazione…' }) as HTMLButtonElement;
    expect(pendingButton.disabled).toBe(true);
    expect((screen.getByRole('button', { name: 'Sposta' }) as HTMLButtonElement).disabled).toBe(true);
    // A repeated form submission is also guarded inside the hook, independently of disabled controls.
    fireEvent.submit(pendingButton.form!);
    expect(api.createReport).toHaveBeenCalledTimes(1);
    await act(async () => request.resolve(savedReport));
    expect(screen.getByRole('heading', { name: 'Segnalazione inviata' })).toBeTruthy();
  });

  it('keeps the complete draft and failure after navigating away, then allows retry', async () => {
    const request = deferred<Report>();
    vi.mocked(api.createReport).mockReturnValueOnce(request.promise).mockResolvedValueOnce(savedReport);
    await renderApp();
    fillReport();
    fireEvent.click(screen.getByRole('button', { name: 'Invia segnalazione' }));
    switchTab('Percorso');
    await act(async () => request.reject(new Error('Connessione non disponibile. Riprova.')));
    switchTab('Segnala');
    expectDraft();
    expect(screen.getByRole('alert').textContent).toBe('Connessione non disponibile. Riprova.');
    expect((screen.getByRole('button', { name: 'Invia segnalazione' }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Invia segnalazione' })));
    expect(api.createReport).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.createReport).mock.calls[0]).toEqual(vi.mocked(api.createReport).mock.calls[1]);
    expect(screen.getByRole('heading', { name: 'Segnalazione inviata' })).toBeTruthy();
  });

  it('adds a successful report while its form is hidden and clears the draft only after success', async () => {
    const request = deferred<Report>();
    vi.mocked(api.createReport).mockReturnValueOnce(request.promise);
    await renderApp();
    fillReport();
    fireEvent.click(screen.getByRole('button', { name: 'Invia segnalazione' }));
    switchTab('Percorso');
    await act(async () => request.resolve(savedReport));
    expect(screen.getByLabelText('Numero segnalazioni').textContent).toBe('1');
    switchTab('Segnala');
    expect(screen.getByRole('heading', { name: 'Segnalazione inviata' })).toBeTruthy();
    expect(screen.getByText('non verificata', { exact: true })).toBeTruthy();
    fireEvent.click(screen.getByRole('button', { name: 'Nuova segnalazione' }));
    expect((screen.getByRole('textbox', { name: /Cosa hai trovato/ }) as HTMLTextAreaElement).value).toBe('');
    expect((screen.getByRole('combobox', { name: /Categoria/ }) as HTMLSelectElement).value).toBe('');
    expect(screen.queryByText(/Punto selezionato/)).toBeNull();
    expect((screen.getByRole('button', { name: 'Invia segnalazione' }) as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not claim Gemma use when service status is unavailable', async () => {
    vi.mocked(api.status).mockRejectedValueOnce(new Error('Status unavailable'));
    await renderApp();
    switchTab('Segnala');
    expect(screen.getByText('Interpretazione: stato non disponibile')).toBeTruthy();
    expect(screen.getByText(/Il metodo usato sarà indicato nel risultato/)).toBeTruthy();
    expect(screen.queryByText(/Gemma/)).toBeNull();
  });

  it('clears either route pick mode when the header opens an existing pinned report draft', async () => {
    await renderApp();
    fillReport();
    for (const [index, mode] of ['from', 'to'].entries()) {
      switchTab('Percorso');
      fireEvent.click(screen.getAllByRole('button', { name: 'Scegli sulla mappa' })[index]);
      expect(screen.getByLabelText('Modalità selezione').textContent).toBe(mode);
      fireEvent.click(screen.getByRole('button', { name: '+ Segnala ostacolo' }));
      expect(screen.getByLabelText('Modalità selezione').textContent).toBe('none');
      expect(screen.queryByText(/Tocca la mappa per scegliere/)).toBeNull();
      expectDraft();
    }
  });

  it('accepts a late route without moving the map while placing a report pin or viewing a detail', async () => {
    const first = deferred<RouteResult>();
    const second = deferred<RouteResult>();
    const route: RouteResult = {
      mode: 'wheelchair', provider: 'valhalla',
      coords: [[point.lat, point.lng], [destination.lat, destination.lng]], distanceM: 200, durationS: 180,
    };
    vi.mocked(api.route)
      .mockReturnValueOnce(first.promise).mockResolvedValueOnce({ ...route, mode: 'foot' })
      .mockReturnValueOnce(second.promise).mockResolvedValueOnce({ ...route, mode: 'foot' });
    await renderApp();
    fireEvent.click(screen.getAllByRole('button', { name: 'Scegli sulla mappa' })[0]);
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona punto di prova' }));
    fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona destinazione di prova' }));
    fireEvent.click(screen.getByRole('button', { name: 'Calcola percorso' }));
    fireEvent.click(screen.getByRole('button', { name: '+ Segnala ostacolo' }));
    expect(screen.getByLabelText('Modalità selezione').textContent).toBe('report');
    const beforePicking = screen.getByLabelText('Centro richiesto').textContent;
    await act(async () => first.resolve(route));
    expect(screen.getByLabelText('Percorso visualizzato').textContent).toBe(JSON.stringify(route.coords));
    expect(screen.getByLabelText('Modalità selezione').textContent).toBe('report');
    expect(screen.getByLabelText('Centro richiesto').textContent).toBe(beforePicking);

    switchTab('Percorso');
    const manual = screen.getByText('Modifica le tappe').closest('details')!;
    expect(manual.open).toBe(false);
    fireEvent.click(screen.getByText('Modifica le tappe'));
    fireEvent.click(await screen.findByRole('button', { name: 'Calcola percorso' }));
    fireEvent.click(screen.getByRole('button', { name: 'Apri dettaglio di prova' }));
    const beforeDetail = screen.getByLabelText('Centro richiesto').textContent;
    expect(JSON.parse(beforeDetail!).coords).toEqual([[point.lat, point.lng]]);
    await act(async () => second.resolve(route));
    expect(screen.getByLabelText('Percorso visualizzato').textContent).toBe(JSON.stringify(route.coords));
    expect(screen.getByLabelText('Centro richiesto').textContent).toBe(beforeDetail);
    expect(screen.getByRole('region', { name: "Dettagli dell'elemento selezionato" })).toBeTruthy();
  });
});
