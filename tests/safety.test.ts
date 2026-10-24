import { afterEach, describe, expect, it, vi } from 'vitest';
import type { LatLngTuple } from '../shared/types.ts';
import { getRoute } from '../server/routing.ts';
import { classifyEdges, decodePolyline6, NOT_VERIFIABLE } from '../server/safety.ts';

afterEach(() => vi.unstubAllGlobals());

function encodePolyline6(coords: LatLngTuple[]): string {
  let out = '', pLat = 0, pLng = 0;
  const enc = (v: number) => {
    let n = v < 0 ? ~(v << 1) : v << 1, s = '';
    while (n >= 0x20) { s += String.fromCharCode((0x20 | (n & 0x1f)) + 63); n >>= 5; }
    return s + String.fromCharCode(n + 63);
  };
  for (const [lat, lng] of coords) {
    const [a, b] = [Math.round(lat * 1e6), Math.round(lng * 1e6)];
    out += enc(a - pLat) + enc(b - pLng);
    [pLat, pLng] = [a, b];
  }
  return out;
}

type E = { use: string; road_class?: string; sidewalk?: string; m: number; name?: string };

/** Un candidato: percorso con geometria propria e i tratti che trace_attributes vi riconoscerebbe. */
function candidate(id: number, distanceM: number, edges: E[]) {
  const coords: LatLngTuple[] = edges.map((_, i) => [43.71 + id / 1000, 10.40 + i / 10_000]);
  coords.push([43.71 + id / 1000, 10.40 + edges.length / 10_000]);
  return { id, distanceM, coords, edges };
}

/** Simula Valhalla: /route restituisce i candidati, /trace_attributes i tratti del candidato ricevuto. */
function mockValhalla(cands: ReturnType<typeof candidate>[], opts: { traceDown?: boolean } = {}) {
  const fetchMock = vi.fn(async (url: string, init?: RequestInit) => {
    const body = JSON.parse(init!.body as string);
    if (url.endsWith('/route')) {
      return Response.json({ code: 'Ok', routes: cands.map((c) => ({ distance: c.distanceM, duration: c.distanceM, geometry: { coordinates: c.coords.map(([a, b]) => [b, a]) } })) });
    }
    if (opts.traceDown) return new Response('down', { status: 503 });
    const c = cands.find((x) => Math.abs(x.coords[0][0] - body.shape[0].lat) < 1e-9)!;
    return Response.json({
      shape: encodePolyline6(c.coords),
      edges: c.edges.map((e, i) => ({
        use: e.use, road_class: e.road_class ?? 'service_other', sidewalk: e.sidewalk ?? 'none', length: e.m / 1000,
        ...(e.name ? { names: [e.name] } : {}), begin_shape_index: i, end_shape_index: i + 1,
      })),
    });
  });
  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

const A = { lat: 43.71, lng: 10.4 }, B = { lat: 43.72, lng: 10.41 };
const footway = (m: number): E => ({ use: 'footway', m });

describe('routing sicuro: casi richiesti', () => {
  it('destinazione raggiungibile su marciapiedi mappati: percorso verificabile', async () => {
    mockValhalla([candidate(0, 300, [footway(150), { use: 'road', road_class: 'residential', sidewalk: 'both', m: 100 }, { use: 'pedestrian_crossing', m: 10 }, footway(40)])]);
    const r = await getRoute(A, B, {});
    expect(r.safety).toMatchObject({ checked: true, verifiable: true, carriagewayM: 0, pedestrianM: 200, sidewalkM: 100, segments: [] });
  });

  it('una strada non percorribile a piedi in sicurezza fa scegliere un\'alternativa, con spiegazione', async () => {
    mockValhalla([
      candidate(0, 300, [footway(50), { use: 'road', road_class: 'tertiary', m: 150, name: 'Via Crispi' }, footway(100)]),
      candidate(1, 420, [footway(420)]),
    ]);
    const r = await getRoute(A, B, {});
    expect(r.distanceM).toBe(420);
    expect(r.safety).toMatchObject({ verifiable: true, alternatives: 2 });
    expect(r.safety!.choice).toMatch(/strada principale senza marciapiede.*120 m in più/);
  });

  it('strada senza percorso pedonale noto: non è presentata come verificabile e i tratti sono indicati', async () => {
    mockValhalla([candidate(0, 250, [footway(40), { use: 'road', road_class: 'residential', m: 120, name: 'Via Santa Maria' }, { use: 'road', road_class: 'residential', m: 90, name: 'Via Santa Maria' }])]);
    const r = await getRoute(A, B, {});
    expect(r.safety).toMatchObject({ checked: true, verifiable: false, carriagewayM: 210 });
    // tratti consecutivi della stessa via uniti in un unico segmento da evidenziare
    expect(r.safety!.segments).toEqual([expect.objectContaining({ kind: 'carriageway', name: 'Via Santa Maria', lengthM: 210 })]);
    expect(r.safety!.segments[0].coords).toHaveLength(3);
  });

  it('percorso con scale: scartato per chi usa la sedia a rotelle', async () => {
    mockValhalla([candidate(0, 150, [footway(60), { use: 'steps', m: 8 }, footway(80)]), candidate(1, 290, [footway(290)])]);
    const r = await getRoute(A, B, {});
    expect(r.distanceM).toBe(290);
    expect(r.safety!.choice).toMatch(/su scale/);
  });

  it('nessuna alternativa accettabile: comunica il limite invece di proporre un itinerario', async () => {
    mockValhalla([
      candidate(0, 300, [{ use: 'road', road_class: 'primary', m: 300 }]),
      candidate(1, 350, [footway(100), { use: 'road', road_class: 'secondary', m: 250 }]),
    ]);
    const err = await getRoute(A, B, {}).catch((e) => e);
    expect(err.status).toBe(422);
    expect(err.message).toContain(NOT_VERIFIABLE);
  });
});

describe('routing sicuro: casi limite', () => {
  it('preferisce meno carreggiata, ma non a costo di deviazioni sproporzionate', async () => {
    // Caso reale Via Sant'Antonio → Cottolengo: 150 m di carreggiata vs 29 m con 190 m in più
    mockValhalla([
      candidate(0, 295, [footway(73), { use: 'road', road_class: 'residential', m: 150 }, { use: 'road', road_class: 'residential', sidewalk: 'both', m: 72 }]),
      candidate(1, 485, [footway(233), { use: 'road', road_class: 'residential', m: 29 }, { use: 'road', road_class: 'residential', sidewalk: 'both', m: 223 }]),
      candidate(2, 1500, [footway(1500)]),
    ]);
    const r = await getRoute(A, B, {});
    expect(r.distanceM).toBe(485);
    expect(r.safety!.choice).toMatch(/evita 120 m su carreggiata.*190 m in più/);
  });

  it('i brevi tratti di collegamento ai punti scelti non contano come carreggiata', async () => {
    mockValhalla([candidate(0, 230, [{ use: 'road', road_class: 'residential', m: 9 }, footway(201), { use: 'road', road_class: 'residential', m: 15 }])]);
    expect((await getRoute(A, B, {})).safety).toMatchObject({ verifiable: true, carriagewayM: 0 });
  });

  it('ignora frammenti di carreggiata di pochi centimetri dovuti all\'aggancio alla rete', async () => {
    mockValhalla([candidate(0, 230, [footway(100), { use: 'road', road_class: 'residential', m: 0.4 }, footway(100)])]);
    expect((await getRoute(A, B, {})).safety).toMatchObject({ verifiable: true, segments: [] });
  });

  it('un breve tratto di carreggiata a metà percorso resta non verificato', async () => {
    mockValhalla([candidate(0, 230, [footway(100), { use: 'road', road_class: 'residential', m: 9 }, footway(100)])]);
    expect((await getRoute(A, B, {})).safety).toMatchObject({ verifiable: false, carriagewayM: 9 });
  });

  it('se la verifica dei tratti non è disponibile il percorso è marcato come non verificato', async () => {
    mockValhalla([candidate(0, 300, [footway(300)])], { traceDown: true });
    expect((await getRoute(A, B, {})).safety).toMatchObject({ checked: false, verifiable: false });
  });

  it('chiede le alternative a Valhalla', async () => {
    const f = mockValhalla([candidate(0, 300, [footway(300)])]);
    await getRoute(A, B, {});
    expect(JSON.parse((f.mock.calls[0] as unknown as [string, RequestInit])[1].body as string).alternates).toBe(2);
  });
});

describe('decodePolyline6 / classifyEdges', () => {
  it('decodifica la geometria di Valhalla', () => {
    const pts: LatLngTuple[] = [[43.714812, 10.395901], [43.7201, 10.405]];
    expect(decodePolyline6(encodePolyline6(pts))).toEqual(pts);
  });

  it('distingue strade principali e carreggiata', () => {
    const s = classifyEdges([
      { use: 'footway', length: 0.05, begin_shape_index: 0, end_shape_index: 1 },
      { use: 'road', road_class: 'residential', sidewalk: 'none', length: 0.04, begin_shape_index: 1, end_shape_index: 2 },
      { use: 'road', road_class: 'secondary', sidewalk: 'none', length: 0.03, begin_shape_index: 2, end_shape_index: 3 },
      { use: 'footway', length: 0.05, begin_shape_index: 3, end_shape_index: 4 },
    ], [[0, 0], [0, 1], [0, 2], [0, 3], [0, 4]]);
    expect(s.segments.map((x) => x.kind)).toEqual(['carriageway', 'main_road']);
    expect(s.carriagewayM).toBe(70);
  });
});
