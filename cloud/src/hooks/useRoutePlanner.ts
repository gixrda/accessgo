import { useCallback, useEffect, useRef, useState } from 'react';
import type { LatLngTuple, RouteResult } from '../../shared/types.ts';
import { api } from '../api.ts';

export type Place = { lat: number; lng: number; label: string };

export function useRoutePlanner({ onFocus }: { onFocus: (coords: LatLngTuple[]) => void }) {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [route, setRoute] = useState<RouteResult | null>(null);
  const [footRoute, setFootRoute] = useState<RouteResult | null>(null);
  const [routeLoading, setRouteLoading] = useState(false);
  const [routeError, setRouteError] = useState<string | null>(null);
  const endpoints = useRef<{ from: Place | null; to: Place | null }>({ from: null, to: null });
  const sequence = useRef(0);
  const controller = useRef<AbortController | null>(null);

  const invalidate = useCallback(() => {
    // Increment first: even a provider that ignores AbortSignal cannot restore an old route.
    sequence.current += 1;
    controller.current?.abort();
    controller.current = null;
    setRoute(null);
    setFootRoute(null);
    setRouteError(null);
    setRouteLoading(false);
  }, []);

  const changeFrom = useCallback((point: Place | null) => {
    endpoints.current.from = point;
    setFrom(point);
    invalidate();
  }, [invalidate]);

  const changeTo = useCallback((point: Place | null) => {
    endpoints.current.to = point;
    setTo(point);
    invalidate();
  }, [invalidate]);

  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
  }, []);

  const calculate = useCallback(async () => {
    const { from: start, to: end } = endpoints.current;
    if (!start || !end) return;
    invalidate();
    const requestId = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const isCurrent = () => sequence.current === requestId && !abort.signal.aborted;
    setRouteLoading(true);

    // The comparison is optional. Show the main route without waiting for a slower service.
    let mainSucceeded = false;
    const comparison: { value: RouteResult | null } = { value: null };
    const main = api.route(start, end, 'wheelchair', abort.signal);
    void api.route(start, end, 'foot', abort.signal).then((result) => {
      if (!isCurrent()) return;
      comparison.value = result;
      if (mainSucceeded) setFootRoute(result);
    }).catch(() => { /* An unavailable comparison must not hide the main route. */ });

    try {
      const result = await main;
      if (!isCurrent()) return;
      mainSucceeded = true;
      setRoute(result);
      setFootRoute(comparison.value);
      setRouteLoading(false);
      // Late comparisons do not move the map again after the user starts inspecting it.
      onFocus([...result.coords, ...(comparison.value?.coords ?? [])]);
    } catch (error) {
      if (!isCurrent()) return;
      setRouteError(error instanceof Error ? error.message : 'Si è verificato un errore. Riprova.');
      setRouteLoading(false);
      abort.abort();
    }
  }, [invalidate, onFocus]);

  return { from, to, changeFrom, changeTo, route, footRoute, routeLoading, routeError, calculate };
}
