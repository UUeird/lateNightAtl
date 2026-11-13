import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

export const ATL: L.LatLngExpression = [33.76, -84.38];

export function createMap(el: HTMLElement | string, options: L.MapOptions = {}) {
  const map = L.map(el, { center: ATL, zoom: 12, ...options });
  // Standard OSM tiles, darkened with CSS (.dark-tiles in global.css). OSM's tile policy
  // allows light use; for real traffic switch to a provider like Stadia or MapTiler.
  L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    className: 'dark-tiles',
    maxZoom: 19,
  }).addTo(map);
  return map;
}

export const markerStyle: L.CircleMarkerOptions = {
  radius: 8,
  color: '#0f1020',
  weight: 2,
  fillColor: '#ffc857',
  fillOpacity: 0.95,
};
