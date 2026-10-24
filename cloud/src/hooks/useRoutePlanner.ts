import { useCallback, useEffect, useRef, useState } from 'react';
import { inPisa, type LatLngTuple, type RouteResult } from '../../shared/types.ts';
import { api } from '../api.ts';

export type Place = { lat: number; lng: number; label: string };
export type ViaStop = { id: string; place: Place | null };
export type Itinerary = { from: Place; to: Place; via: Place[] };
export const MAX_VIA_STOPS = 3;

export function useRoutePlanner({ onFocus }: { onFocus: (coords: LatLngTuple[]) => void }) {
  const [from, setFrom] = useState<Place | null>(null);
  const [to, setTo] = useState<Place | null>(null);
  const [via, setVia] = useState<ViaStop[]>([]);
  const viaRef = useRef<ViaStop[]>([]);
  const nextStopId = useRef(0);
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

  const changeViaStops = useCallback((stops: ViaStop[]) => {
    viaRef.current = stops;
    setVia(stops);
    invalidate();
  }, [invalidate]);
  const addVia = useCallback(() => {
    if (viaRef.current.length >= MAX_VIA_STOPS) return;
    changeViaStops([...viaRef.current, { id: String(++nextStopId.current), place: null }]);
  }, [changeViaStops]);
  const changeVia = useCallback((id: string, place: Place | null) => {
    if (!viaRef.current.some((stop) => stop.id === id)) return;
    changeViaStops(viaRef.current.map((stop) => stop.id === id ? { ...stop, place } : stop));
  }, [changeViaStops]);
  const removeVia = useCallback((id: string) => {
    changeViaStops(viaRef.current.filter((stop) => stop.id !== id));
  }, [changeViaStops]);
  const moveVia = useCallback((id: string, direction: -1 | 1) => {
    const stops = [...viaRef.current];
    const index = stops.findIndex((stop) => stop.id === id);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= stops.length) return;
    [stops[index], stops[target]] = [stops[target], stops[index]];
    changeViaStops(stops);
  }, [changeViaStops]);
  const reverse = useCallback(() => {
    const current = endpoints.current;
    endpoints.current = { from: current.to, to: current.from };
    setFrom(current.to); setTo(current.from);
    changeViaStops([...viaRef.current].reverse());
  }, [changeViaStops]);

  /** Replace all confirmed voice points together before starting a request. */
  const replaceItinerary = useCallback((itinerary: Itinerary) => {
    invalidate();
    if (itinerary.via.length > MAX_VIA_STOPS
      || [itinerary.from, ...itinerary.via, itinerary.to].some((point) => !point || !inPisa(point.lat, point.lng))) {
      setRouteError('Conferma tutti i luoghi nell’area di Pisa prima di calcolare.');
      return false;
    }
    const stops = itinerary.via.map((place) => ({ id: String(++nextStopId.current), place }));
    endpoints.current = { from: itinerary.from, to: itinerary.to };
    viaRef.current = stops;
    setFrom(itinerary.from); setTo(itinerary.to); setVia(stops);
    return true;
  }, [invalidate]);

  useEffect(() => () => {
    sequence.current += 1;
    controller.current?.abort();
  }, []);

  const calculate = useCallback(async () => {
    const { from: start, to: end } = endpoints.current;
    if (!start || !end || viaRef.current.some((stop) => !stop.place)) return;
    const stops = viaRef.current.map((stop) => stop.place!);
    invalidate();
    const requestId = sequence.current;
    const abort = new AbortController();
    controller.current = abort;
    const isCurrent = () => sequence.current === requestId && !abort.signal.aborted;
    setRouteLoading(true);

    // The comparison is optional. Show the main route without waiting for a slower service.
    let mainSucceeded = false;
    const comparison: { value: RouteResult | null } = { value: null };
    const main = api.route(start, end, 'wheelchair', abort.signal, stops);
    void api.route(start, end, 'foot', abort.signal, stops).then((result) => {
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

  return { from, to, via, changeFrom, changeTo, addVia, changeVia, removeVia, moveVia, reverse, replaceItinerary, route, footRoute, routeLoading, routeError, calculate };
}
