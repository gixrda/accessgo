import { describe, expect, it } from 'vitest';
import { classifyPath, normalizeOverpass } from '../server/osm.ts';

describe('classifyPath', () => {
  it.each([
    [{ highway: 'steps' }, 'steps', 'known_obstacle'],
    [{ highway: 'steps', 'ramp:wheelchair': 'yes' }, 'steps', 'possible_issue'],
    [{ highway: 'footway', wheelchair: 'no' }, 'wheelchair', 'known_obstacle'],
    [{ barrier: 'kerb', kerb: 'raised' }, 'kerb', 'known_obstacle'],
    [{ barrier: 'kerb', 'kerb:height': '0.12' }, 'kerb', 'known_obstacle'],
    [{ barrier: 'kerb' }, 'kerb', 'possible_issue'],
    [{ highway: 'crossing', kerb: 'lowered' }, 'kerb', 'positive_info'],
    [{ highway: 'footway', width: '0.7' }, 'width', 'known_obstacle'],
    [{ highway: 'footway', width: '1.0' }, 'width', 'possible_issue'],
    [{ highway: 'footway', incline: '8%' }, 'incline', 'possible_issue'],
    [{ highway: 'footway', incline: 'up' }, 'incline', 'possible_issue'],
    [{ highway: 'pedestrian', surface: 'sett' }, 'surface', 'possible_issue'],
    [{ highway: 'footway', smoothness: 'bad' }, 'smoothness', 'possible_issue'],
    [{ barrier: 'bollard' }, 'barrier', 'possible_issue'],
    [{ barrier: 'turnstile' }, 'barrier', 'known_obstacle'],
    [{ highway: 'crossing' }, 'crossing', 'info'],
    [{ highway: 'footway', surface: 'asphalt' }, 'surface', 'info'],
  ])('%o → %s / %s', (tags, kind, certainty) => {
    expect(classifyPath(tags)).toMatchObject({ kind, certainty });
  });

  it('non attribuisce accessibilità positiva in assenza di dati', () => {
    expect(classifyPath({ highway: 'footway' })).toBeNull();
    expect(classifyPath({ highway: 'footway', incline: '3%' })?.certainty).toBe('info');
  });

  it('dà priorità all\'ostacolo più grave', () => {
    expect(classifyPath({ highway: 'steps', surface: 'asphalt', wheelchair: 'yes' })?.certainty).toBe('known_obstacle');
  });
});

describe('normalizeOverpass', () => {
  const features = normalizeOverpass([
    { type: 'node', id: 1, lat: 43.71, lon: 10.4, tags: { barrier: 'kerb', kerb: 'raised' } },
    { type: 'way', id: 2, geometry: [{ lat: 43.71, lon: 10.4 }, { lat: 43.711, lon: 10.401 }], tags: { highway: 'steps' } },
    { type: 'way', id: 3, geometry: [{ lat: 43.71, lon: 10.4 }, { lat: 43.712, lon: 10.402 }], tags: { building: 'yes', wheelchair: 'yes', name: 'Biblioteca' } },
    { type: 'relation', id: 4, tags: { wheelchair: 'limited' } },
    { type: 'node', id: 5, lat: 43.71, lon: 10.4 },
    { type: 'way', id: 6, geometry: [{ lat: 43.71, lon: 10.4 }], tags: { highway: 'footway' } },
  ]);

  it('normalizza fonte, tipo, posizione e certezza', () => {
    expect(features.map((f) => f.id)).toEqual(['node/1', 'way/2', 'way/3']);
    expect(features[0]).toMatchObject({ source: 'osm', scope: 'path', kind: 'kerb', certainty: 'known_obstacle', geometry: { type: 'point', coords: [43.71, 10.4] } });
    expect(features[1].geometry).toEqual({ type: 'line', coords: [[43.71, 10.4], [43.711, 10.401]] });
  });

  it('rappresenta i luoghi come punto al centro, separati dai percorsi', () => {
    expect(features[2]).toMatchObject({ scope: 'place', name: 'Biblioteca', certainty: 'positive_info' });
    expect(features[2].geometry.type).toBe('point');
    const [lat, lng] = features[2].geometry.coords as [number, number];
    expect(lat).toBeCloseTo(43.711);
    expect(lng).toBeCloseTo(10.401);
  });
});
