// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import type { RouteResult } from '../shared/types.ts';
import { RoutePanel } from '../src/components/RoutePanel.tsx';
import { RouteRiskBanner } from '../src/components/RouteRiskBanner.tsx';
import type { RouteAnalysis } from '../src/lib/analysis.ts';

vi.mock('../src/hooks/useVoiceNavigation.ts', () => ({ useVoiceNavigation: () => ({
  supported: true, configured: true, gpsSupported: true, available: true,
  instructions: [], status: '', testVoice: vi.fn(), preview: vi.fn(), start: vi.fn(), stop: vi.fn(),
}) }));
const analysis: RouteAnalysis = { known: [], possible: [], positive: [], unknown: [], reports: [], coverage: .12 };
const route: RouteResult = { mode: 'wheelchair', provider: 'valhalla', coords: [[43.72, 10.4], [43.721, 10.4]], distanceM: 100, durationS: 90,
  safety: { status: 'checked', message: 'Controllo di prova.', blockedBy: [], avoided: [], reportsChecked: true } };
const props = {
  from: null, to: null, setFrom: vi.fn(), setTo: vi.fn(), pickMode: null, setPickMode: vi.fn(), onLocate: vi.fn(), locating: false,
  onCalculate: vi.fn(), loading: false, error: null, route, analysis, footRoute: null, footAnalysis: null,
  showFoot: false, setShowFoot: vi.fn(), onSelect: vi.fn(),
};
afterEach(cleanup);

describe('prominent route risk and navigation gate', () => {
  it('shows risk before distance and guidance, including low coverage and unknown accessibility', () => {
    const { container } = render(<RoutePanel {...props} />);
    const risk = screen.getByRole('region', { name: 'Percorso da verificare' });
    const stats = container.querySelector('.stats')!;
    const voice = container.querySelector('.voice-navigation')!;
    expect(risk.compareDocumentPosition(stats) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(risk.compareDocumentPosition(voice) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    const details = risk.querySelector('details')!;
    expect(details.open).toBe(false);
    const note = risk.querySelector('.route-risk__note')!;
    expect(note.closest('details')).toBeNull();
    expect(note.textContent).toContain('accessibilità sconosciuta');
    fireEvent.click(screen.getByText('Dettagli dei rischi'));
    expect(details.open).toBe(true);
    expect(screen.getByText(/I tratti senza dati restano di accessibilità sconosciuta/)).toBeTruthy();
    expect(screen.getByText('12%')).toBeTruthy();
    expect(screen.getByText(/Non è un punteggio di sicurezza/)).toBeTruthy();
  });
  it.each(['blocked', 'unavailable'] as const)('disables every voice control for %s routes', (status) => {
    render(<RoutePanel {...props} route={{ ...route, safety: { ...route.safety!, status,
      blockedBy: [{ id: 'report-1', source: 'verified_report', label: 'Passaggio chiuso', coordinate: [43.72, 10.4] }] } }} />);
    expect(screen.getByRole('alert')).toBeTruthy();
    expect(screen.getByText('Guida vocale disattivata')).toBeTruthy();
    expect(screen.queryByRole('button', { name: /Prova voce|Ascolta|Avvia guida/ })).toBeNull();
    expect(screen.getByText(/segnalazione confermata/)).toBeTruthy();
    const warning = screen.getByText(/Solo consultazione: non partire/);
    expect(warning.closest('details')).toBeNull();
    expect(screen.getByText(/1 ostacolo sul tragitto/).closest('details')).toBeNull();
    expect(screen.getByText(/segnalazione confermata/).closest('details')?.open).toBe(false);
    fireEvent.click(screen.getByText('Dettagli dei rischi'));
    expect(screen.getByText(/segnalazione confermata/).closest('details')?.open).toBe(true);
  });
  it('labels rerouting as exclusion of obstacles without certifying safety', () => {
    render(<RouteRiskBanner analysis={analysis} route={{ ...route, safety: { ...route.safety!, status: 'rerouted',
      avoided: [{ id: 'osm-1', source: 'osm', label: 'Scale', coordinate: [43.72, 10.4] }] } }} />);
    expect(screen.getByRole('heading', { name: '1 ostacolo evitato' })).toBeTruthy();
    const counts = screen.getByText('0 possibili criticità · 0 attraversamenti senza dati.');
    expect(counts.closest('details')).toBeNull();
    fireEvent.click(screen.getByText('Dettagli dei rischi'));
    expect(screen.getByText('1 ostacolo escluso dal percorso ricalcolato.').closest('details')?.open).toBe(true);
    expect(screen.getByText(/Non verificato sul posto/)).toBeTruthy();
  });
  it('warns clearly when the report check or route analysis is missing', () => {
    render(<RouteRiskBanner analysis={null} route={{ ...route, safety: { ...route.safety!, reportsChecked: false } }} />);
    const note = screen.getByText(/Segnalazioni aggiornate non controllate/);
    expect(note.closest('details')).toBeNull();
    expect(note.textContent).toContain('Dati incompleti');
    fireEvent.click(screen.getByText('Dettagli dei rischi'));
    expect(screen.getByText(/segnalazioni aggiornate non sono state controllate/)).toBeTruthy();
    expect(screen.getByText(/Informazioni insufficienti/)).toBeTruthy();
  });
});
