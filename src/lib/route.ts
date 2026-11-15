/**
 * Travel routes from the visitor to a place, from FOSSGIS's public Valhalla server
 * (OpenStreetMap's routing service). Free with no key, on fair-use terms: at most one
 * request per second per user, and no uptime guarantee. So routes are fetched only when
 * the visitor asks, once per mode, and the server address lives here, in one place.
 * Times assume clear roads (no live traffic).
 * https://fossgis.de/arbeitsgruppen/osm-server/nutzungsbedingungen
 */
import type { LngLat } from './geo';

export const ROUTING_URL = 'https://valhalla1.openstreetmap.de/route';

export type RouteMode = 'auto' | 'pedestrian';

export interface Route {
  miles: number;
  seconds: number;
  /** The path, as [lng, lat] points. */
  line: LngLat[];
}

/** Valhalla's encoded polyline, at its 6-digit precision. */
export function decodePolyline6(encoded: string): LngLat[] {
  const points: LngLat[] = [];
  let index = 0;
  let lat = 0;
  let lng = 0;
  const next = () => {
    let result = 0;
    let shift = 0;
    let byte: number;
    do {
      byte = encoded.charCodeAt(index++) - 63;
      result |= (byte & 0x1f) << shift;
      shift += 5;
    } while (byte >= 0x20);
    return result & 1 ? ~(result >> 1) : result >> 1;
  };
  while (index < encoded.length) {
    lat += next();
    lng += next();
    points.push([lng / 1e6, lat / 1e6]);
  }
  return points;
}

/** "4 min", "1 hr 5 min". */
export function formatDuration(seconds: number): string {
  const minutes = Math.max(1, Math.round(seconds / 60));
  if (minutes < 60) return `${minutes} min`;
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? `${h} hr ${m} min` : `${h} hr`;
}

/** Ask the routing server for a route. Throws if there isn't one. */
export async function fetchRoute(from: LngLat, to: LngLat, mode: RouteMode): Promise<Route> {
  const request = {
    locations: [
      { lon: from[0], lat: from[1] },
      { lon: to[0], lat: to[1] },
    ],
    costing: mode,
    units: 'miles',
    directions_type: 'none', // just the path and totals, not turn-by-turn text
  };
  const response = await fetch(`${ROUTING_URL}?json=${encodeURIComponent(JSON.stringify(request))}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Routing failed (${response.status})`);
  const { trip } = await response.json();
  return {
    miles: trip.summary.length,
    seconds: trip.summary.time,
    line: trip.legs.flatMap((leg: { shape: string }) => decodePolyline6(leg.shape)),
  };
}

/**
 * The first `fraction` (0–1) of a path, measured along its length, ending at an
 * interpolated point so it grows smoothly rather than jumping from vertex to vertex.
 * Lengths are in degrees, flattened by the latitude's cosine: plenty for a city route.
 */
export function partialLine(line: LngLat[], fraction: number): LngLat[] {
  if (fraction >= 1 || line.length < 2) return line;
  if (fraction <= 0) return line.slice(0, 1);
  const k = Math.cos((line[0][1] * Math.PI) / 180);
  const seg = (a: LngLat, b: LngLat) => Math.hypot((b[0] - a[0]) * k, b[1] - a[1]);
  const lengths = line.slice(1).map((p, i) => seg(line[i], p));
  let remaining = lengths.reduce((s, l) => s + l, 0) * fraction;
  for (let i = 0; i < lengths.length; i++) {
    if (remaining <= lengths[i]) {
      const t = lengths[i] ? remaining / lengths[i] : 0;
      const [a, b] = [line[i], line[i + 1]];
      return [...line.slice(0, i + 1), [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]];
    }
    remaining -= lengths[i];
  }
  return line;
}

/** Beyond this straight-line distance, in miles, Walk isn't offered: about a 40-minute walk. */
export const WALK_MAX_MILES = 1.5;

/** Roads wind: a route runs about this much longer than the straight line. */
const DETOUR = 1.3;
/** Average speeds for an estimate, in miles per hour: city driving, and walking. */
const MPH: Record<RouteMode, number> = { auto: 22, pedestrian: 3 };

/** A rough travel time from the straight-line distance, before any route is fetched. */
export function estimateSeconds(miles: number, mode: RouteMode): number {
  return ((miles * DETOUR) / MPH[mode]) * 3600;
}
