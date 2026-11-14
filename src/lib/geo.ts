/** OpenFreeMap's dark style, which the map restyles (src/scripts/map.ts). */
export const MAP_STYLE_URL = 'https://tiles.openfreemap.org/styles/dark';

/** [longitude, latitude], MapLibre's order. */
export type LngLat = [number, number];

const EARTH_RADIUS_MILES = 3958.8;

/** Straight-line distance in miles. */
export function milesBetween([lng1, lat1]: LngLat, [lng2, lat2]: LngLat) {
  const rad = Math.PI / 180;
  const a =
    Math.sin(((lat2 - lat1) * rad) / 2) ** 2 +
    Math.cos(lat1 * rad) * Math.cos(lat2 * rad) * Math.sin(((lng2 - lng1) * rad) / 2) ** 2;
  return 2 * EARTH_RADIUS_MILES * Math.asin(Math.sqrt(a));
}
