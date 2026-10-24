// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useDictation } from '../src/hooks/useDictation.ts';
import { DictationButton } from '../src/components/DictationButton.tsx';
import { ReportPanel } from '../src/components/ReportPanel.tsx';
import { useReportDraft } from '../src/hooks/useReportDraft.ts';
import { getVoiceStatus, transcribeAudio } from '../src/lib/voiceApi.ts';

vi.mock('../src/lib/voiceApi.ts', () => ({ getVoiceStatus: vi.fn(), transcribeAudio: vi.fn() }));
class Recorder {
  static instances: Recorder[] = [];
  static isTypeSupported = vi.fn((type: string) => type.startsWith('audio/webm'));
  state = 'inactive';
  mimeType: string;
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  constructor(public stream: MediaStream, options?: MediaRecorderOptions) {
    this.mimeType = options?.mimeType ?? 'audio/mp4'; Recorder.instances.push(this);
  }
  start = vi.fn(() => { this.state = 'recording'; });
  stop = vi.fn(() => {
    this.state = 'inactive';
    this.ondataavailable?.({ data: new Blob(['audio-bytes'], { type: this.mimeType }) });
    this.onstop?.();
  });
}
let getUserMedia: ReturnType<typeof vi.fn>;
let stopTrack: ReturnType<typeof vi.fn>;
let stream: MediaStream;
const configured = { provider: 'elevenlabs' as const, configured: true, sttModel: 'scribe_v2', ttsModel: 'eleven_multilingual_v2' };
beforeEach(() => {
  vi.useFakeTimers();
  vi.resetAllMocks();
  window.sessionStorage.clear();
  Recorder.instances = [];
  Recorder.isTypeSupported.mockImplementation((type) => type.startsWith('audio/webm'));
  stopTrack = vi.fn();
  stream = { getTracks: () => [{ stop: stopTrack }] } as unknown as MediaStream;
  getUserMedia = vi.fn(async () => stream);
  vi.stubGlobal('isSecureContext', true);
  vi.stubGlobal('MediaRecorder', Recorder);
  Object.defineProperty(navigator, 'mediaDevices', { configurable: true, value: { getUserMedia } });
  vi.mocked(getVoiceStatus).mockResolvedValue(configured);
  vi.mocked(transcribeAudio).mockResolvedValue('Via Roma');
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); vi.useRealTimers(); });
async function settle() { await act(async () => { await Promise.resolve(); }); }

describe('explicit ElevenLabs recording and transcription', () => {
  it('records only after a user click and uploads only after explicit transcription', async () => {
    const onTranscript = vi.fn();
    render(<DictationButton onTranscript={onTranscript} value="" />);
    await settle();
    expect(getUserMedia).not.toHaveBeenCalled();
    expect(transcribeAudio).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Detta in italiano/ })));
    expect(getUserMedia).toHaveBeenCalledExactlyOnceWith({ audio: true });
    expect(Recorder.instances[0].state).toBe('recording');
    expect(transcribeAudio).not.toHaveBeenCalled();
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Trascrivi audio/ })));
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcribeAudio).toHaveBeenCalledTimes(1);
    expect(vi.mocked(transcribeAudio).mock.calls[0][0].type).toBe('audio/webm;codecs=opus');
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith('Via Roma');
  });

  it('chooses audio/mp4 on Safari when WebM is unavailable', async () => {
    Recorder.isTypeSupported.mockImplementation((type) => type === 'audio/mp4');
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle();
    await act(async () => result.current.start());
    expect(Recorder.instances[0].mimeType).toBe('audio/mp4');
    await act(async () => result.current.transcribe());
    expect(vi.mocked(transcribeAudio).mock.calls[0][0].type).toBe('audio/mp4');
  });

  it('passes automatic language detection for a navigation request and preserves the accepted Chinese transcript', async () => {
    const text = '从火车站去比萨斜塔，途经加里波第广场。';
    vi.mocked(transcribeAudio).mockResolvedValue(text);
    const onTranscript = vi.fn();
    render(<DictationButton onTranscript={onTranscript} language="auto" autoPrepare maxLength={500} />);
    await settle();
    expect(screen.getByText(/Italiano, inglese o cinese/).textContent).toContain('rilevamento automatico');
    expect(screen.getByText(/Italiano, inglese o cinese/).textContent).toContain('solo dopo la tua conferma');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Detta la richiesta/ })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Trascrivi audio/ })));
    expect(vi.mocked(transcribeAudio).mock.calls[0][2]).toBe('auto');
    expect(onTranscript).toHaveBeenCalledExactlyOnceWith(text);
  });

  it('retains Italian as the default for existing report and place fields', async () => {
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle(); await act(async () => result.current.start());
    await act(async () => result.current.transcribe());
    expect(vi.mocked(transcribeAudio).mock.calls[0][2]).toBe('it');
  });

  it('notifies the parent synchronously before requesting the microphone, once per eligible start', async () => {
    const events: string[] = [];
    let grant!: (stream: MediaStream) => void;
    getUserMedia.mockImplementation(() => { events.push('microphone'); return new Promise((resolve) => { grant = resolve; }); });
    const onRecordingStart = vi.fn(() => { events.push('start'); });
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn(), onRecordingStart, language: 'auto' }));
    await settle();
    act(() => { void result.current.start(); void result.current.start(); });
    expect(events).toEqual(['start', 'microphone']);
    expect(onRecordingStart).toHaveBeenCalledOnce();
    await act(async () => grant(stream));
    await act(async () => result.current.transcribe());
    expect(onRecordingStart).toHaveBeenCalledOnce();
  });

  it('discards old language-mode transcription and rejects a 501-character navigation request intact', async () => {
    let resolve!: (text: string) => void;
    vi.mocked(transcribeAudio).mockReturnValueOnce(new Promise((done) => { resolve = done; }));
    const onTranscript = vi.fn();
    const { result, rerender } = renderHook(({ language }) => useDictation({ onTranscript, language, maxLength: 500 }), {
      initialProps: { language: 'auto' as 'it' | 'auto' },
    });
    await settle(); await act(async () => result.current.start());
    act(() => result.current.transcribe());
    const signal = vi.mocked(transcribeAudio).mock.calls[0][1]!;
    rerender({ language: 'it' });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve('旧请求'));
    expect(onTranscript).not.toHaveBeenCalled();
    vi.mocked(transcribeAudio).mockResolvedValue('中'.repeat(501));
    await act(async () => result.current.start());
    await act(async () => result.current.transcribe());
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.error).toContain('501 caratteri');
    expect(result.current.error).toContain('ne restano 500');
  });

  it('stops automatically after 30 seconds but waits for an explicit upload click', async () => {
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle(); await act(async () => result.current.start());
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.phase).toBe('ready');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcribeAudio).not.toHaveBeenCalled();
    await act(async () => result.current.transcribe());
    expect(transcribeAudio).toHaveBeenCalledOnce();
  });

  it('cancellation discards audio and never uploads it', async () => {
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle(); await act(async () => result.current.start());
    act(() => result.current.cancel());
    act(() => vi.advanceTimersByTime(30_000));
    expect(result.current.phase).toBe('idle');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('stops a late-granted microphone after cancellation without starting the recorder', async () => {
    let grant!: (stream: MediaStream) => void;
    getUserMedia.mockReturnValue(new Promise((resolve) => { grant = resolve; }));
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle(); act(() => { void result.current.start(); });
    act(() => result.current.cancel());
    await act(async () => grant(stream));
    expect(Recorder.instances).toHaveLength(0);
    expect(stopTrack).toHaveBeenCalledOnce();
  });

  it('does not overwrite edits with late transcriptions and aborts their request', async () => {
    let resolve!: (text: string) => void;
    vi.mocked(transcribeAudio).mockReturnValue(new Promise((done) => { resolve = done; }));
    const onTranscript = vi.fn();
    const { result, rerender } = renderHook(({ value }) => useDictation({ onTranscript, value }), { initialProps: { value: '' } });
    await settle(); await act(async () => result.current.start());
    act(() => result.current.transcribe());
    const signal = vi.mocked(transcribeAudio).mock.calls[0][1]!;
    rerender({ value: 'Testo manuale' });
    expect(signal.aborted).toBe(true);
    await act(async () => resolve('Vecchio testo'));
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('allows only one recording at a time and guards double clicks', async () => {
    const first = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    const second = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle();
    await act(async () => { void first.result.current.start(); void first.result.current.start(); });
    expect(getUserMedia).toHaveBeenCalledTimes(1);
    await act(async () => second.result.current.start());
    expect(first.result.current.phase).toBe('idle');
    expect(second.result.current.phase).toBe('recording');
    expect(Recorder.instances[0].stop).toHaveBeenCalledOnce();
  });

  it('rejects oversized recording chunks without sending audio', async () => {
    const { result } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle(); await act(async () => result.current.start());
    act(() => Recorder.instances[0].ondataavailable?.({ data: new Blob([new Uint8Array(2 * 1024 * 1024 + 1)]) }));
    expect(result.current.phase).toBe('idle');
    expect(result.current.error).toContain('2 MB');
    expect(stopTrack).toHaveBeenCalledOnce();
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it('cleans up capture on unmount and when backgrounding', async () => {
    const { result, unmount } = renderHook(() => useDictation({ onTranscript: vi.fn() }));
    await settle(); await act(async () => result.current.start());
    vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => document.dispatchEvent(new Event('visibilitychange')));
    expect(result.current.phase).toBe('idle');
    expect(stopTrack).toHaveBeenCalledOnce();
    await act(async () => result.current.start());
    unmount();
    expect(stopTrack).toHaveBeenCalledTimes(2);
    expect(transcribeAudio).not.toHaveBeenCalled();
  });

  it.each(['unsupported', 'insecure', 'unconfigured'])('keeps manual entry available when %s', async (scenario) => {
    if (scenario === 'insecure') vi.stubGlobal('isSecureContext', false);
    if (scenario === 'unsupported') vi.stubGlobal('MediaRecorder', undefined);
    if (scenario === 'unconfigured') vi.mocked(getVoiceStatus).mockResolvedValue({ ...configured, configured: false });
    render(<DictationButton onTranscript={vi.fn()} />);
    await settle();
    expect(screen.getByRole('button').hasAttribute('disabled')).toBe(true);
    expect(screen.getByText(/Puoi digitare il testo/)).toBeTruthy();
    expect(screen.queryByRole('status')).toBeNull();
    expect(getUserMedia).not.toHaveBeenCalled();
  });

  it('shows permission errors and leaves text entry untouched', async () => {
    getUserMedia.mockRejectedValue(new DOMException('permission denied', 'NotAllowedError'));
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useDictation({ onTranscript }));
    await settle(); await act(async () => result.current.start());
    expect(result.current.error).toContain('Microfono non autorizzato');
    expect(result.current.phase).toBe('idle');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('rejects overlong text without silently truncating it and handles provider failures', async () => {
    const onTranscript = vi.fn();
    const { result } = renderHook(() => useDictation({ onTranscript, maxLength: 5 }));
    await settle(); await act(async () => result.current.start());
    await act(async () => result.current.transcribe());
    expect(onTranscript).not.toHaveBeenCalled();
    expect(result.current.error).toContain('8 caratteri');
    expect(result.current.error).toContain('ne restano 5');
    expect(result.current.error).toContain('registra un messaggio più breve');
    vi.mocked(transcribeAudio).mockRejectedValue(new Error('Limite ElevenLabs raggiunto. Riprova.'));
    await act(async () => result.current.start());
    await act(async () => result.current.transcribe());
    expect(result.current.error).toContain('Limite ElevenLabs');
    expect(onTranscript).not.toHaveBeenCalled();
  });

  it('honors ReportPanel remaining capacity and preserves the draft when the transcript will not fit', async () => {
    function ReportHarness() {
      const draft = useReportDraft(() => {});
      return <ReportPanel draft={draft} pickMode={null} setPickMode={() => {}} onLocate={() => {}}
        locating={false} status={null} onShow={() => {}} />;
    }
    render(<ReportHarness />);
    await settle();
    const input = screen.getByRole('textbox', { name: /Cosa hai trovato/ }) as HTMLTextAreaElement;
    const original = 'a'.repeat(994);
    fireEvent.change(input, { target: { value: original } });
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Detta il problema/ })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Trascrivi audio/ })));
    expect(input.value).toBe(original);
    expect(screen.getByRole('alert').textContent).toContain('ne restano 5');
    expect(screen.getByRole('alert').textContent).toContain('Il testo esistente non è stato modificato');
    // Five more characters plus the separator fit exactly; none are dropped.
    vi.mocked(transcribeAudio).mockResolvedValue('buche');
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Detta il problema/ })));
    await act(async () => fireEvent.click(screen.getByRole('button', { name: /Trascrivi audio/ })));
    expect(input.value).toBe(`${original} buche`);
    expect(input.value.length).toBe(1000);
  });
});

describe('browser transcription multipart language contract', () => {
  it.each([undefined, 'it', 'auto'] as const)('sends only audio plus optional auto mode for %s', async (language) => {
    const actual = await vi.importActual<typeof import('../src/lib/voiceApi.ts')>('../src/lib/voiceApi.ts');
    const fetchMock = vi.fn().mockResolvedValue(Response.json({ text: 'Pisa Centrale', provider: 'elevenlabs', model: 'scribe_v2' }));
    vi.stubGlobal('fetch', fetchMock);
    const signal = new AbortController().signal;
    expect(await actual.transcribeAudio(new Blob(['recorded'], { type: 'audio/mp4' }), signal, language)).toBe('Pisa Centrale');
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe('/api/voice/transcribe');
    expect(init.signal).toBe(signal);
    expect(init.headers).toBeUndefined();
    const form = init.body as FormData;
    expect(form.get('audio')).toMatchObject({ name: 'dettatura.m4a', type: 'audio/mp4' });
    expect(form.get('language')).toBe(language === 'auto' ? 'auto' : null);
    expect([...form.keys()].sort()).toEqual(language === 'auto' ? ['audio', 'language'] : ['audio']);
  });
});
