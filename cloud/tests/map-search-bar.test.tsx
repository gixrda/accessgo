// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MapSearchBar } from '../src/components/MapSearchBar.tsx';

vi.mock('../src/components/DictationButton.tsx', () => ({ DictationButton: ({ label, value, language, autoPrepare, onRecordingStart, onTranscript }: {
  label: string; value: string; language: string; autoPrepare: boolean;
  onRecordingStart: () => void; onTranscript: (text: string) => void;
}) => <div>
  <button type="button" onClick={onRecordingStart}>{label}</button>
  <button type="button" onClick={() => onTranscript('从骑士广场到比萨斜塔')}>Finish transcription</button>
  <output>{language}/{String(autoPrepare)}/{value}</output>
</div> }));
afterEach(cleanup);

describe('unified top map search', () => {
  it('submits a simple place name through the same request pipeline', () => {
    const onRequest = vi.fn();
    render(<MapSearchBar onRequest={onRequest} />);
    fireEvent.change(screen.getByRole('searchbox', { name: 'Cerca un luogo o chiedi un percorso' }), { target: { value: '  Torre di Pisa  ' } });
    fireEvent.click(screen.getByRole('button', { name: 'Cerca' }));
    expect(onRequest).toHaveBeenCalledExactlyOnceWith('Torre di Pisa');
  });
  it('keeps the voice help open during recording and prepares a multilingual transcript', () => {
    const onRequest = vi.fn();
    const { container } = render(<MapSearchBar onRequest={onRequest} />);
    expect(container.querySelector('.map-search__voice')?.getAttribute('data-open')).toBe('false');
    fireEvent.click(screen.getByRole('button', { name: 'Parla' }));
    expect(container.querySelector('.map-search__voice')?.getAttribute('data-open')).toBe('true');
    expect(onRequest).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole('button', { name: 'Finish transcription' }));
    expect(onRequest).toHaveBeenCalledExactlyOnceWith('从骑士广场到比萨斜塔');
    expect((screen.getByRole('searchbox') as HTMLInputElement).value).toBe('从骑士广场到比萨斜塔');
    expect(container.querySelector('.map-search__voice')?.getAttribute('data-open')).toBe('false');
    expect(screen.getByText('auto/true/从骑士广场到比萨斜塔')).toBeTruthy();
  });
  it('exposes voice information on demand and rejects oversized requests without truncation', () => {
    const onRequest = vi.fn();
    render(<MapSearchBar onRequest={onRequest} />);
    fireEvent.click(screen.getByRole('button', { name: 'Informazioni sulla voce' }));
    expect(screen.getByRole('button', { name: 'Informazioni sulla voce' }).getAttribute('aria-expanded')).toBe('true');
    fireEvent.change(screen.getByRole('searchbox'), { target: { value: 'a'.repeat(501) } });
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('alert').textContent).toContain('500');
    expect(onRequest).not.toHaveBeenCalled();
  });
  it('keeps requests disabled when requested by the parent', () => {
    const onRequest = vi.fn();
    render(<MapSearchBar onRequest={onRequest} disabled />);
    fireEvent.submit(screen.getByRole('search'));
    expect(screen.getByRole('searchbox').hasAttribute('disabled')).toBe(true);
    expect(onRequest).not.toHaveBeenCalled();
  });
});
