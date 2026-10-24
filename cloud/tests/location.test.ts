import { afterEach, describe, expect, it, vi } from 'vitest';
import { locateForPlanning } from '../src/lib/location.ts';

const now = 1_000_000;
const position = (changes: { lat?: number; lng?: number; accuracy?: number; timestamp?: number } = {}) => ({
  coords: { latitude: changes.lat ?? 43.72, longitude: changes.lng ?? 10.4, accuracy: changes.accuracy ?? 15 },
  timestamp: changes.timestamp ?? now,
}) as GeolocationPosition;
type LocationMethod = Geolocation['getCurrentPosition'];
const settings = (getCurrentPosition: LocationMethod) => ({ geolocation: { getCurrentPosition }, secure: true, now: () => now });
const browserError = (code: number) => ({ code, message: 'Internal provider details must not reach the user.' }) as GeolocationPositionError;

afterEach(() => { vi.unstubAllGlobals(); });

describe('one-shot planning geolocation', () => {
  it('uses the browser only after explicit invocation and accepts a fresh precise Pisa position', async () => {
    const getCurrentPosition = vi.fn<LocationMethod>((success) => success(position()));
    expect(getCurrentPosition).not.toHaveBeenCalled();
    expect(await locateForPlanning(settings(getCurrentPosition))).toEqual({ lat: 43.72, lng: 10.4, accuracy: 15, approximate: false });
    expect(getCurrentPosition).toHaveBeenCalledOnce();
    expect(getCurrentPosition.mock.calls[0][2]).toEqual({ enableHighAccuracy: true, timeout: 12_000, maximumAge: 15_000 });
  });

  it.each([2, 3])('retries error code %i exactly once using lower accuracy', async (code) => {
    const getCurrentPosition = vi.fn<LocationMethod>()
      .mockImplementationOnce((_success, error) => error?.(browserError(code)))
      .mockImplementationOnce((success) => success(position({ accuracy: 300 })));
    expect(await locateForPlanning(settings(getCurrentPosition))).toEqual({ lat: 43.72, lng: 10.4, accuracy: 300, approximate: true });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
    expect(getCurrentPosition.mock.calls[1][2]).toEqual({ enableHighAccuracy: false, timeout: 10_000, maximumAge: 15_000 });
  });

  it('does not repeat a denied permission prompt and explains iPhone Safari settings', async () => {
    const getCurrentPosition = vi.fn<LocationMethod>((_success, error) => error?.(browserError(1)));
    await expect(locateForPlanning(settings(getCurrentPosition))).rejects.toThrow(/iPhone.*Safari/);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it.each([2, 3])('shows a clear manual alternative after retry error %i', async (code) => {
    const getCurrentPosition = vi.fn<LocationMethod>((_success, error) => error?.(browserError(code)));
    const promise = locateForPlanning(settings(getCurrentPosition));
    await expect(promise).rejects.toThrow(code === 3 ? /troppo tempo/ : /non disponibile/);
    await expect(promise).rejects.toThrow(/mappa.*indirizzo/);
    await expect(promise).rejects.not.toThrow(/Internal provider/);
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });

  it.each([[100, false], [100.01, true], [1000, true]] as const)('labels %im accuracy as approximate=%s', async (accuracy, approximate) => {
    const getCurrentPosition = vi.fn<LocationMethod>((success) => success(position({ accuracy })));
    expect(await locateForPlanning(settings(getCurrentPosition))).toMatchObject({ accuracy, approximate });
  });

  it('rejects excessive uncertainty instead of silently selecting a location', async () => {
    const getCurrentPosition = vi.fn<LocationMethod>((success) => success(position({ accuracy: 1000.01 })));
    await expect(locateForPlanning(settings(getCurrentPosition))).rejects.toThrow(/superiore a 1 km.*mappa.*indirizzo/);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('distinguishes an actual location outside the Pisa coverage area', async () => {
    const getCurrentPosition = vi.fn<LocationMethod>((success) => success(position({ lat: 43.77 })));
    await expect(locateForPlanning(settings(getCurrentPosition))).rejects.toThrow(/fuori dall’area di Pisa/);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it.each([
    { lat: Number.NaN }, { lng: Number.POSITIVE_INFINITY }, { accuracy: -1 }, { accuracy: Number.NaN },
    { timestamp: Number.NaN }, { timestamp: now - 60_001 }, { timestamp: now + 1 },
  ])('rejects invalid or stale measurements %j without another browser request', async (changes) => {
    const getCurrentPosition = vi.fn<LocationMethod>((success) => success(position(changes)));
    await expect(locateForPlanning(settings(getCurrentPosition))).rejects.toThrow(/non valida o non aggiornata/);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('accepts measurements up to sixty seconds old', async () => {
    const getCurrentPosition = vi.fn<LocationMethod>((success) => success(position({ timestamp: now - 60_000 })));
    expect(await locateForPlanning(settings(getCurrentPosition))).toMatchObject({ approximate: false });
  });

  it('rejects insecure contexts and missing support before calling location APIs', async () => {
    const getCurrentPosition = vi.fn<LocationMethod>();
    await expect(locateForPlanning({ ...settings(getCurrentPosition), secure: false })).rejects.toThrow(/HTTPS/);
    expect(getCurrentPosition).not.toHaveBeenCalled();
    await expect(locateForPlanning({ secure: true, geolocation: null })).rejects.toThrow(/non supportata/);
  });

  it.each(['SecurityError', 'NotAllowedError', 'UnknownError'])('handles synchronous %s safely without leaking browser internals', async (name) => {
    const getCurrentPosition = vi.fn<LocationMethod>(() => { throw new DOMException('private browser internals', name); });
    const pending = locateForPlanning(settings(getCurrentPosition));
    await expect(pending).rejects.toThrow(name === 'UnknownError' ? /non disponibile/ : /non autorizzata/);
    await expect(pending).rejects.not.toThrow(/private browser/);
    expect(getCurrentPosition).toHaveBeenCalledOnce();
  });

  it('ignores late callbacks from the first attempt after the retry begins', async () => {
    let firstSuccess!: PositionCallback;
    let retrySuccess!: PositionCallback;
    const getCurrentPosition = vi.fn<LocationMethod>()
      .mockImplementationOnce((success, error) => { firstSuccess = success; error?.(browserError(3)); })
      .mockImplementationOnce((success) => { retrySuccess = success; });
    const pending = locateForPlanning(settings(getCurrentPosition));
    await Promise.resolve();
    firstSuccess(position({ lat: 43.71 }));
    retrySuccess(position({ lat: 43.73, accuracy: 200 }));
    expect(await pending).toMatchObject({ lat: 43.73, accuracy: 200, approximate: true });
    expect(getCurrentPosition).toHaveBeenCalledTimes(2);
  });
});
