// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Interpretation, Report } from '../shared/types.ts';
import App from '../src/App.tsx';
import { api } from '../src/api.ts';

vi.mock('../src/api.ts', () => ({
  api: { status: vi.fn(), osm: vi.fn(), reports: vi.fn(), analyzeReport: vi.fn(),
    createReport: vi.fn(), route: vi.fn(), geocode: vi.fn(), setStatus: vi.fn() },
}));

// Keep the real form, draft/analysis hooks and application state; replace only Leaflet.
vi.mock('../src/components/MapView.tsx', () => ({
  MapView: ({ onPick, reports }: {
    onPick: (point: { lat: number; lng: number }) => void;
    reports: Report[];
  }) => <div>
    <button onClick={() => onPick(point)}>Seleziona punto di prova</button>
    <output aria-label="Numero segnalazioni">{reports.length}</output>
  </div>,
}));

const point = { lat: 43.72, lng: 10.4 };
const description = 'Non ci sono gradini. Il problema è una buca profonda.';
const changedDescription = "Un'auto parcheggiata blocca completamente il marciapiede.";
const interpretation: Interpretation = {
  category: 'uneven_surface', obstacle: 'Buca', summary: 'Una buca profonda rende la superficie irregolare.',
  severity: 'unknown', missing_info: ['Dimensioni della buca'], engine: 'gemma', model: 'gemma-4-26b-a4b-it',
};
const secondInterpretation: Interpretation = {
  ...interpretation, category: 'obstructed_sidewalk', obstacle: 'Auto parcheggiata',
  summary: 'Una vettura ostruisce il marciapiede.', missing_info: [],
};
const savedReport: Report = {
  id: 'report-published-deliberately', ...point, description, category: interpretation.category,
  categorySource: 'interpretation', source: 'user_report', status: 'unverified',
  createdAt: '2026-10-24T10:00:00Z', interpretation,
};
const preview = (value = interpretation) => ({ interpretation: value, published: false as const });

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error: Error) => void;
  const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; });
  return { promise, resolve, reject };
}

beforeEach(() => {
  window.sessionStorage.clear();
  vi.resetAllMocks();
  vi.stubGlobal('matchMedia', vi.fn((media: string) => ({ matches: true, media,
    addEventListener: vi.fn(), removeEventListener: vi.fn() })));
  vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'gemma-google', admin: false,
    reportRequiresSignIn: true, reportSignedIn: false });
  vi.mocked(api.osm).mockResolvedValue({ source: 'test fixture', fetchedAt: '2026-10-24T10:00:00Z',
    bbox: [43.7, 10.3, 43.8, 10.5], features: [] });
  vi.mocked(api.reports).mockResolvedValue([]);
  vi.mocked(api.analyzeReport).mockResolvedValue(preview());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

async function openReport() {
  await act(async () => { render(<App />); });
  fireEvent.click(screen.getByRole('button', { name: 'Segnala', exact: true }));
}
function textInput() { return screen.getByRole('textbox', { name: /Cosa hai trovato/ }) as HTMLTextAreaElement; }
function enterText(value = description) { fireEvent.change(textInput(), { target: { value } }); }
function analyzeButton() { return screen.getByRole('button', { name: 'Analizza senza pubblicare' }) as HTMLButtonElement; }
function expectUnpublished() {
  expect(api.createReport).not.toHaveBeenCalled();
  expect(screen.getByLabelText('Numero segnalazioni').textContent).toBe('0');
  expect(screen.queryByRole('heading', { name: 'Segnalazione inviata' })).toBeNull();
}

describe('analysis-only report flow in the actual App', () => {
  it('analyzes anonymously with no map pin, and never adds the preview to public reports or session storage', async () => {
    await openReport();
    expect(analyzeButton().disabled).toBe(true);
    enterText();
    expect(analyzeButton().disabled).toBe(false);
    expect(screen.getByRole('link', { name: 'Accedi per inviare' })).toBeTruthy();
    expect(screen.queryByText(/Punto selezionato/)).toBeNull();

    await act(async () => fireEvent.click(analyzeButton()));
    expect(api.analyzeReport).toHaveBeenCalledExactlyOnceWith(description, expect.any(AbortSignal));
    expect(screen.getByRole('heading', { name: 'Anteprima · non pubblicata' })).toBeTruthy();
    expect(screen.getByText(/Interpretata dall'AI/)).toBeTruthy();
    expect(screen.getByText(interpretation.model!)).toBeTruthy();
    expect(screen.getByText(interpretation.summary)).toBeTruthy();
    expect(textInput().value).toBe(description);
    expect(window.sessionStorage.length).toBe(0);
    expectUnpublished();
  });

  it('shows actual fallback attribution even when service status says Gemma is configured', async () => {
    vi.mocked(api.analyzeReport).mockResolvedValue(preview({ ...interpretation, engine: 'fallback',
      model: undefined, note: 'Servizio AI temporaneamente non disponibile.' }));
    await openReport();
    enterText();
    await act(async () => fireEvent.click(analyzeButton()));
    expect(screen.getByText('Classificazione a regole')).toBeTruthy();
    expect(screen.getByText(/\(non AI\).*Servizio AI temporaneamente non disponibile/)).toBeTruthy();
    expect(screen.queryByText(/Interpretata dall'AI/)).toBeNull();
    expectUnpublished();
  });

  it('clears an existing preview as soon as its source description changes', async () => {
    await openReport();
    enterText();
    await act(async () => fireEvent.click(analyzeButton()));
    expect(screen.getByText(interpretation.summary)).toBeTruthy();
    enterText(changedDescription);
    expect(screen.queryByRole('heading', { name: 'Anteprima · non pubblicata' })).toBeNull();
    expect(screen.queryByText(interpretation.summary)).toBeNull();
    expect(analyzeButton().disabled).toBe(false);
    expect(api.analyzeReport).toHaveBeenCalledTimes(1);
    expectUnpublished();
  });

  it('locks duplicate analysis requests and ignores an aborted response after editing and retrying', async () => {
    const first = deferred<ReturnType<typeof preview>>();
    const second = deferred<ReturnType<typeof preview>>();
    vi.mocked(api.analyzeReport).mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    await openReport();
    enterText();
    const button = analyzeButton();
    act(() => { fireEvent.click(button); fireEvent.click(button); });
    expect(api.analyzeReport).toHaveBeenCalledTimes(1);
    expect((screen.getByRole('button', { name: 'Analisi in corso…' }) as HTMLButtonElement).disabled).toBe(true);
    expect(textInput().disabled).toBe(false);
    const firstSignal = vi.mocked(api.analyzeReport).mock.calls[0][1]!;

    enterText(changedDescription);
    expect(firstSignal.aborted).toBe(true);
    fireEvent.click(analyzeButton());
    expect(api.analyzeReport).toHaveBeenCalledTimes(2);
    expect(vi.mocked(api.analyzeReport).mock.calls[1][0]).toBe(changedDescription);
    await act(async () => second.resolve(preview(secondInterpretation)));
    expect(screen.getByText(secondInterpretation.summary)).toBeTruthy();
    // The mock intentionally ignores AbortSignal to prove the UI also guards stale resolutions.
    await act(async () => first.resolve(preview()));
    expect(screen.getByText(secondInterpretation.summary)).toBeTruthy();
    expect(screen.queryByText(interpretation.summary)).toBeNull();
    expectUnpublished();
  });

  it('preserves the entered text after a failure and permits an explicit retry', async () => {
    vi.mocked(api.analyzeReport).mockRejectedValueOnce(new Error('Analisi non disponibile. Riprova.'))
      .mockResolvedValueOnce(preview());
    await openReport();
    enterText();
    await act(async () => fireEvent.click(analyzeButton()));
    expect(screen.getByRole('alert').textContent).toContain('Analisi non disponibile. Riprova.');
    expect(textInput().value).toBe(description);
    expect(analyzeButton().disabled).toBe(false);
    expectUnpublished();
    await act(async () => fireEvent.click(analyzeButton()));
    expect(api.analyzeReport).toHaveBeenCalledTimes(2);
    expect(screen.getByText(interpretation.summary)).toBeTruthy();
    expect(screen.queryByRole('alert')).toBeNull();
    expectUnpublished();
  });

  it('blocks public submission during analysis and publishes only after the separate original submit action', async () => {
    vi.mocked(api.status).mockResolvedValue({ routing: 'valhalla', ai: 'gemma-google', admin: false,
      reportRequiresSignIn: true, reportSignedIn: true });
    vi.mocked(api.createReport).mockResolvedValue(savedReport);
    const request = deferred<ReturnType<typeof preview>>();
    vi.mocked(api.analyzeReport).mockReturnValue(request.promise);
    await openReport();
    enterText();
    fireEvent.click(screen.getByRole('button', { name: 'Scegli sulla mappa' }));
    fireEvent.click(screen.getByRole('button', { name: 'Seleziona punto di prova' }));
    fireEvent.click(analyzeButton());
    const submit = screen.getByRole('button', { name: 'Invia segnalazione' }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    // Keyboard or programmatic form submission must not bypass the disabled publish button.
    fireEvent.submit(document.getElementById('report-form')!);
    expectUnpublished();
    await act(async () => request.resolve(preview()));
    expectUnpublished();
    expect((screen.getByRole('button', { name: 'Invia segnalazione' }) as HTMLButtonElement).disabled).toBe(false);
    await act(async () => fireEvent.click(screen.getByRole('button', { name: 'Invia segnalazione' })));
    expect(api.createReport).toHaveBeenCalledExactlyOnceWith({ ...point, description });
    expect(screen.getByLabelText('Numero segnalazioni').textContent).toBe('1');
    expect(screen.getByRole('heading', { name: 'Segnalazione inviata' })).toBeTruthy();
  });

  it('aborts an unfinished preview when leaving the form, without publishing its late result', async () => {
    const request = deferred<ReturnType<typeof preview>>();
    vi.mocked(api.analyzeReport).mockReturnValue(request.promise);
    await openReport();
    enterText();
    fireEvent.click(analyzeButton());
    const signal = vi.mocked(api.analyzeReport).mock.calls[0][1]!;
    fireEvent.click(screen.getByRole('button', { name: 'Percorso' }));
    expect(signal.aborted).toBe(true);
    await act(async () => request.resolve(preview()));
    fireEvent.click(screen.getByRole('button', { name: 'Segnala', exact: true }));
    expect(textInput().value).toBe(description);
    expect(screen.queryByRole('heading', { name: 'Anteprima · non pubblicata' })).toBeNull();
    expectUnpublished();
  });
});
