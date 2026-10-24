import type {
  GeocodeResult, Interpretation, OsmDataset, Report, ReportCategory, RouteResult, ServerStatus, VerificationStatus,
} from '../shared/types.ts';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(path, { ...init, headers: { 'Content-Type': 'application/json', ...init?.headers } });
  } catch (error) {
    if (init?.signal?.aborted) throw error;
    throw new Error('Connessione non disponibile. Riprova.');
  }
  const data = await res.json().catch(() => null);
  if (!res.ok) throw new Error((data as { error?: string } | null)?.error ?? 'Si è verificato un errore. Riprova.');
  return data as T;
}

type Point = { lat: number; lng: number };

export const api = {
  status: () => request<ServerStatus>('/api/status'),
  osm: () => request<OsmDataset>('/api/osm'),
  reports: () => request<Report[]>('/api/reports'),
  analyzeReport: (description: string, signal?: AbortSignal) =>
    request<{ interpretation: Interpretation; published: false }>('/api/analyze', {
      method: 'POST', body: JSON.stringify({ description }), signal,
    }),
  createReport: (body: Point & { description: string; category?: ReportCategory }) =>
    request<Report>('/api/reports', { method: 'POST', body: JSON.stringify(body) }),
  setStatus: (id: string, status: VerificationStatus, token: string) =>
    request<Report>(`/api/reports/${id}`, { method: 'PATCH', body: JSON.stringify({ status }), headers: { 'x-admin-token': token } }),
  route: (from: Point, to: Point, profile: 'wheelchair' | 'foot' = 'wheelchair', signal?: AbortSignal, via: Point[] = []) =>
    request<RouteResult>('/api/route', { method: 'POST', body: JSON.stringify({ from, to, profile, ...(via.length ? { via } : {}) }), signal }),
  geocode: (q: string, signal?: AbortSignal) => request<GeocodeResult[]>(`/api/geocode?q=${encodeURIComponent(q)}`, { signal }),
};
