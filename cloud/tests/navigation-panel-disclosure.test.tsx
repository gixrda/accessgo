// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { NavigationPanel } from '../src/components/NavigationPanel.tsx';
import type { RouteResult } from '../shared/types.ts';

const voice = vi.hoisted(() => ({
  available: true, supported: true, configured: true, gpsSupported: true, active: false,
  checking: false, audioLoading: false, audioPlaying: false, readyPosition: true,
  voiceError: null as string | null, status: 'Pronto alla partenza.',
  upcoming: { instruction: 'Gira a destra.' }, upcomingInstruction: 'Gira a destra.', upcomingDistanceM: 100, remainingM: 200,
  instructions: [{ instruction: 'Gira a destra.', legIndex: 0, shapeIndex: 1 }],
  start: vi.fn(), stop: vi.fn(), testVoice: vi.fn(), preview: vi.fn(), stopAudio: vi.fn(),
}));
vi.mock('../src/hooks/useVoiceNavigation.ts', () => ({ useVoiceNavigation: () => voice }));
const route: RouteResult = { mode: 'wheelchair', provider: 'valhalla', coords: [[43.72, 10.4], [43.721, 10.4]], distanceM: 100, durationS: 90 };
beforeEach(() => {
  vi.clearAllMocks();
  Object.assign(voice, { available: true, active: false, configured: true, voiceError: null, audioPlaying: false });
});
afterEach(cleanup);

describe('compact navigation controls', () => {
  it('keeps start visible while previews and directions stay in a closed native disclosure', () => {
    const { container } = render(<NavigationPanel route={route} />);
    const details = container.querySelector('details')!;
    expect(details.open).toBe(false);
    expect(screen.getByRole('button', { name: 'Avvia guida vocale' }).closest('details')).toBeNull();
    expect(screen.getByText('Prova voce ElevenLabs').closest('details')).toBe(details);
    expect(screen.getByText('Gira a destra.').closest('details')).toBe(details);
    expect(details.querySelector('summary')?.textContent).toBe('Opzioni voce e indicazioni');
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Prova voce ElevenLabs' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ascolta prossima indicazione' }));
    fireEvent.click(screen.getByRole('button', { name: 'Ascolta indicazione 1' }));
    expect(voice.testVoice).toHaveBeenCalledOnce();
    expect(voice.preview.mock.calls).toEqual([[], [0]]);
  });
  it('keeps stop, guidance status, next turn and errors outside the closed disclosure', () => {
    Object.assign(voice, { active: true, configured: false, voiceError: 'Servizio audio non disponibile.', audioPlaying: true });
    const { container } = render(<NavigationPanel route={route} />);
    const details = container.querySelector('details')!;
    const stop = screen.getByRole('button', { name: 'Interrompi guida vocale' }) as HTMLButtonElement;
    expect(stop.closest('details')).toBeNull();
    expect(stop.disabled).toBe(false);
    expect(screen.getByRole('alert').closest('details')).toBeNull();
    expect(screen.getByText('Pronto alla partenza.').closest('details')).toBeNull();
    expect(screen.getByText(/Prossima indicazione · circa/).closest('details')).toBeNull();
    fireEvent.click(details.querySelector('summary')!);
    fireEvent.click(details.querySelector('summary')!);
    expect(details.open).toBe(false);
    expect(voice.stop).not.toHaveBeenCalled();
    expect(voice.stopAudio).not.toHaveBeenCalled();
    fireEvent.click(stop);
    expect(voice.stop).toHaveBeenCalledOnce();
  });
  it.each(['blocked', 'unavailable'] as const)('offers no voice controls on %s routes', (status) => {
    render(<NavigationPanel route={{ ...route, safety: { status, message: 'Controllo non completato.', blockedBy: [], avoided: [], reportsChecked: true } }} />);
    expect(screen.getByText('Guida vocale disattivata')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
  it('uses a single compact explanation when routing provides no usable maneuvers', () => {
    voice.available = false;
    render(<NavigationPanel route={route} />);
    expect(screen.getByText('Guida vocale non disponibile')).toBeTruthy();
    expect(screen.queryByRole('button')).toBeNull();
  });
});
