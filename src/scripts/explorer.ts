import L from 'leaflet';
import { createMap, markerStyle } from './map';
import { atlantaNow, closesLabel, openSpanAt, tonight, type Hours } from '../lib/hours';

interface Place {
  id: string;
  name: string;
  type: string;
  typeLabel: string;
  cuisine: string[];
  area: string;
  lat: number;
  lng: number;
  hours: Hours;
  url: string;
}

const DEFAULTS: Record<string, string> = { night: 'tonight', at: '1260', area: '', type: '', cuisine: '', q: '' };

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

export function initExplorer() {
  const places: Place[] = JSON.parse(document.getElementById('places-data')!.textContent!);
  const form = document.getElementById('filters') as HTMLFormElement;
  const list = document.getElementById('list')!;
  const count = document.getElementById('count')!;
  const empty = document.getElementById('empty')!;
  const atSelect = form.elements.namedItem('at') as HTMLSelectElement;
  const cards = new Map(places.map((p) => [p.id, list.querySelector<HTMLElement>(`[data-id="${p.id}"]`)!]));

  const map = createMap('map');
  const layer = L.layerGroup().addTo(map);
  const markers = new Map(
    places.map((p) => [
      p.id,
      L.circleMarker([p.lat, p.lng], markerStyle).bindPopup(''),
    ]),
  );

  // Restore filters from the URL so filtered views can be shared.
  const params = new URLSearchParams(location.search);
  for (const [name, value] of params) {
    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = value;
  }

  const popupHtml = (p: Place, status: string) =>
    `<a href="${p.url}"><strong>${escapeHtml(p.name)}</strong></a><br>${escapeHtml(p.typeLabel)} · ${escapeHtml(p.area)}<br>${escapeHtml(status)}`;

  function update(fit: boolean) {
    const f = Object.fromEntries(new FormData(form)) as Record<string, string>;
    const live = f.night === 'now';
    atSelect.disabled = live;
    const now = atlantaNow();
    const night = live ? now.day : f.night === 'tonight' ? tonight() : Number(f.night);
    const t = live ? now.minutes : Number(f.at);
    const q = (f.q ?? '').trim().toLowerCase();

    const results: { p: Place; end: number; label: string }[] = [];
    for (const p of places) {
      const span = openSpanAt(p.hours, night, t);
      const ok =
        span &&
        (!f.area || p.area === f.area) &&
        (!f.type || p.type === f.type) &&
        (!f.cuisine || p.cuisine.includes(f.cuisine)) &&
        (!q || [p.name, p.area, p.typeLabel, ...p.cuisine].join(' ').toLowerCase().includes(q));
      cards.get(p.id)!.hidden = !ok;
      if (ok) results.push({ p, end: span[1], label: closesLabel(span[1], span[0]) });
    }

    // Latest-closing first.
    results.sort((a, b) => b.end - a.end || a.p.name.localeCompare(b.p.name));
    layer.clearLayers();
    for (const { p, label } of results) {
      const card = cards.get(p.id)!;
      card.querySelector('[data-status]')!.textContent = label;
      list.appendChild(card);
      layer.addLayer(markers.get(p.id)!.setPopupContent(popupHtml(p, label)));
    }

    count.textContent = `${results.length} ${results.length === 1 ? 'place' : 'places'}`;
    empty.hidden = results.length > 0;

    if (fit && results.length) {
      map.fitBounds(L.latLngBounds(results.map(({ p }) => [p.lat, p.lng])), { padding: [40, 40], maxZoom: 15 });
    }

    // Keep the URL in sync, omitting defaults.
    const out = new URLSearchParams();
    for (const [k, v] of Object.entries(f)) if (v !== DEFAULTS[k] && !(k === 'at' && live)) out.set(k, v);
    const qs = out.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  list.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-locate]')?.dataset.locate;
    if (!id) return;
    const m = markers.get(id)!;
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
    m.openPopup();
    document.getElementById('map')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  let timer: number | undefined;
  form.addEventListener('input', (e) => {
    const isText = (e.target as HTMLElement).matches('input[type=search]');
    clearTimeout(timer);
    timer = window.setTimeout(() => update(true), isText ? 150 : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  // "Right now" goes stale; refresh every minute.
  setInterval(() => {
    if ((form.elements.namedItem('night') as HTMLSelectElement).value === 'now') update(false);
  }, 60_000);

  update(true);
}
