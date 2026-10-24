// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useElevenLabsVoice } from '../src/hooks/useElevenLabsVoice.ts';
import { getVoiceStatus, requestVoiceAudio } from '../src/lib/voiceApi.ts';

vi.mock('../src/lib/voiceApi.ts', () => ({ getVoiceStatus: vi.fn(), requestVoiceAudio: vi.fn() }));
const fakeBlob = () => ({ arrayBuffer: async () => new ArrayBuffer(10) }) as Blob;

class Playback {
  buffer: unknown; onended: (() => void) | null = null;
  connect = vi.fn(); disconnect = vi.fn(); start = vi.fn(); stop = vi.fn();
}
class AudioContextMock {
  static instances: AudioContextMock[] = [];
  state = 'suspended'; destination = {};
  sources: Playback[] = [];
  resume = vi.fn(async () => { this.state = 'running'; });
  close = vi.fn(async () => { this.state = 'closed'; });
  decodeAudioData = vi.fn(async () => ({}));
  createBufferSource = vi.fn(() => { const source = new Playback(); this.sources.push(source); return source; });
  constructor() { AudioContextMock.instances.push(this); }
}

beforeEach(() => {
  vi.clearAllMocks();
  AudioContextMock.instances = [];
  vi.stubGlobal('AudioContext', AudioContextMock);
  vi.stubGlobal('webkitAudioContext', undefined);
  vi.mocked(getVoiceStatus).mockResolvedValue({ provider: 'elevenlabs', configured: true, sttModel: 'scribe_v2', ttsModel: 'eleven_flash_v2_5' });
  vi.mocked(requestVoiceAudio).mockResolvedValue(fakeBlob());
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); vi.restoreAllMocks(); });
const flush = () => act(async () => { await Promise.resolve(); });

describe('ElevenLabs audio lifecycle', () => {
  it('does not request audio until a click, unlocks Safari audio immediately and plays the returned buffer', async () => {
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    expect(result.current.configured).toBe(true);
    expect(requestVoiceAudio).not.toHaveBeenCalled();
    expect(AudioContextMock.instances).toHaveLength(0);
    act(() => result.current.speak('Tra circa 100 metri: gira a destra.'));
    const context = AudioContextMock.instances[0];
    expect(context.resume).toHaveBeenCalledOnce();
    await flush();
    expect(requestVoiceAudio).toHaveBeenCalledExactlyOnceWith('Tra circa 100 metri: gira a destra.', expect.any(AbortSignal));
    expect(context.sources[0].start).toHaveBeenCalledOnce();
    expect(result.current.loading).toBe(false);
    expect(result.current.playing).toBe(true);
    act(() => context.sources[0].onended?.());
    expect(result.current.playing).toBe(false);
  });

  it('reuses only an in-memory cache for repeated cues', async () => {
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    act(() => result.current.speak('Gira a destra.')); await flush();
    act(() => result.current.speak('Gira a destra.')); await flush();
    expect(requestVoiceAudio).toHaveBeenCalledOnce();
    expect(AudioContextMock.instances[0].sources).toHaveLength(2);
    act(() => result.current.reset());
    act(() => result.current.speak('Gira a destra.')); await flush();
    expect(requestVoiceAudio).toHaveBeenCalledTimes(2);
  });

  it('unlocks live navigation audio without an unnecessary TTS request', async () => {
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    await act(async () => { expect(await result.current.activate()).toBe(true); });
    expect(AudioContextMock.instances[0].resume).toHaveBeenCalledOnce();
    expect(requestVoiceAudio).not.toHaveBeenCalled();
  });

  it('keeps at most five decoded cues', async () => {
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    for (let i = 0; i < 6; i++) {
      act(() => result.current.speak(`Indicazione ${i}`)); await flush();
    }
    act(() => result.current.speak('Indicazione 0')); await flush();
    expect(requestVoiceAudio).toHaveBeenCalledTimes(7);
  });

  it('aborts a pending audio request and discards late bytes when GPS/route invalidates a cue', async () => {
    let resolve!: (blob: Blob) => void;
    vi.mocked(requestVoiceAudio).mockReturnValue(new Promise((done) => { resolve = done; }));
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    act(() => result.current.speak('Vecchia svolta')); await flush();
    const signal = vi.mocked(requestVoiceAudio).mock.calls[0][1]!;
    act(() => result.current.cancel());
    expect(signal.aborted).toBe(true);
    await act(async () => { resolve(fakeBlob()); });
    expect(AudioContextMock.instances[0].decodeAudioData).not.toHaveBeenCalled();
    expect(AudioContextMock.instances[0].sources).toHaveLength(0);
  });

  it('a new cue replaces ongoing playback; unmount closes audio and stops it', async () => {
    const { result, unmount } = renderHook(useElevenLabsVoice);
    await flush();
    act(() => result.current.speak('Prima indicazione')); await flush();
    const context = AudioContextMock.instances[0];
    act(() => result.current.speak('Seconda indicazione')); await flush();
    expect(context.sources[0].stop).toHaveBeenCalledOnce();
    unmount();
    expect(context.sources[1].stop).toHaveBeenCalledOnce();
    expect(context.close).toHaveBeenCalledOnce();
  });

  it('does not use browser speech as a hidden fallback when ElevenLabs is missing', async () => {
    vi.mocked(getVoiceStatus).mockResolvedValue({ provider: 'elevenlabs', configured: false, sttModel: 'scribe_v2', ttsModel: 'eleven_flash_v2_5' });
    const browserSpeak = vi.fn();
    vi.stubGlobal('speechSynthesis', { speak: browserSpeak });
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    expect(result.current.error).toContain('ElevenLabs non configurato');
    act(() => result.current.speak('Prova')); await flush();
    expect(requestVoiceAudio).not.toHaveBeenCalled();
    expect(browserSpeak).not.toHaveBeenCalled();
  });

  it('shows provider errors honestly and leaves text guidance usable', async () => {
    vi.mocked(requestVoiceAudio).mockRejectedValue(new Error('Limite ElevenLabs raggiunto. Riprova tra poco.'));
    const { result } = renderHook(useElevenLabsVoice);
    await flush();
    act(() => result.current.speak('Gira a destra.')); await flush();
    expect(result.current.error).toContain('Limite ElevenLabs');
    expect(result.current.loading).toBe(false);
    expect(AudioContextMock.instances[0].sources).toHaveLength(0);
  });
});
