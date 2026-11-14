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

const METERS_PER_MILE = 1609.344;
const ATL_CENTER = L.latLng(33.749, -84.388);
const formatMiles = (mi: number) => (mi < 0.1 ? '< 0.1 mi' : `${mi < 10 ? mi.toFixed(1) : Math.round(mi)} mi`);

const FIT_OPTS: L.FitBoundsOptions = { padding: [40, 40], maxZoom: 15 };

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

  // "Near me": the browser's geolocation, only on request. The location stays in the page.
  let here: L.LatLng | null = null;
  const youMarker = L.circleMarker([0, 0], { radius: 7, color: '#fff', weight: 3, fillColor: '#4ea1ff', fillOpacity: 1 })
    .bindTooltip('You are here');
  const nearBtn = document.getElementById('near-me') as HTMLButtonElement;
  const withinSel = form.elements.namedItem('within') as HTMLSelectElement;
  const geoMsg = document.getElementById('geo-msg')!;
  const say = (text = '') => {
    geoMsg.textContent = text;
    geoMsg.hidden = !text;
  };
  const setNear = (on: boolean) => {
    nearBtn.setAttribute('aria-pressed', String(on));
    nearBtn.textContent = on ? 'Near me ✓' : 'Near me';
    nearBtn.disabled = false;
    withinSel.disabled = !on;
    if (!on) withinSel.value = '';
  };

  nearBtn.addEventListener('click', () => {
    if (here) {
      here = null;
      youMarker.remove();
      setNear(false);
      say();
      update(true);
      return;
    }
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      say('Location isn’t available here. It needs a secure (https) connection and a browser that supports it.');
      return;
    }
    nearBtn.disabled = true;
    nearBtn.textContent = 'Locating…';
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        here = L.latLng(pos.coords.latitude, pos.coords.longitude);
        youMarker.setLatLng(here).addTo(map);
        setNear(true);
        const miles = here.distanceTo(ATL_CENTER) / METERS_PER_MILE;
        say(miles > 40 ? `You look to be about ${Math.round(miles)} miles from Atlanta. Distances are from where you are now.` : '');
        update(true);
      },
      (err) => {
        setNear(false);
        say(
          err.code === err.PERMISSION_DENIED
            ? 'Location permission was denied. You can allow it in your browser’s site settings.'
            : 'Couldn’t get your location. Try again in a moment.',
        );
      },
      { enableHighAccuracy: false, timeout: 10_000, maximumAge: 300_000 },
    );
  });

  // Restore filters from the URL so filtered views can be shared.
  const params = new URLSearchParams(location.search);
  for (const [name, value] of params) {
    const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
    if (el) el.value = value;
  }

  let fitTo: L.LatLngBounds | null = null;
  const badge = document.getElementById('filter-badge')!;
  // Open the extra filters if a shared link uses them.
  if (['area', 'type', 'cuisine'].some((k) => params.get(k))) {
    form.classList.add('expanded');
    document.getElementById('more-filters')!.setAttribute('aria-expanded', 'true');
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

    const within = Number(f.within) || Infinity;

    const results: { p: Place; end: number; label: string; miles: number }[] = [];
    for (const p of places) {
      const span = openSpanAt(p.hours, night, t);
      const miles = here ? here.distanceTo([p.lat, p.lng]) / METERS_PER_MILE : NaN;
      const ok =
        span &&
        !(miles > within) &&
        (!f.area || p.area === f.area) &&
        (!f.type || p.type === f.type) &&
        (!f.cuisine || p.cuisine.includes(f.cuisine)) &&
        (!q || [p.name, p.area, p.typeLabel, ...p.cuisine].join(' ').toLowerCase().includes(q));
      cards.get(p.id)!.hidden = !ok;
      if (ok) results.push({ p, end: span[1], label: closesLabel(span[1], span[0]), miles });
    }

    // Nearest first when location is on, otherwise latest-closing first.
    results.sort((a, b) => (here ? a.miles - b.miles : b.end - a.end) || a.p.name.localeCompare(b.p.name));
    layer.clearLayers();
    for (const { p, label, miles } of results) {
      const card = cards.get(p.id)!;
      card.querySelector('[data-status]')!.textContent = label;
      card.querySelector('[data-distance]')!.textContent = here ? formatMiles(miles) : '';
      list.appendChild(card);
      layer.addLayer(markers.get(p.id)!.setPopupContent(popupHtml(p, label)));
    }

    count.textContent = `${results.length} ${results.length === 1 ? 'place' : 'places'}`;
    empty.hidden = results.length > 0;

    // Frame the user and the closest few results, or all results.
    const pts = here ? [here, ...results.slice(0, 5).map(({ p }) => L.latLng(p.lat, p.lng))] : results.map(({ p }) => L.latLng(p.lat, p.lng));
    fitTo = pts.length ? L.latLngBounds(pts) : null;
    if (fit && fitTo) map.fitBounds(fitTo, FIT_OPTS);

    // Show how many of the tucked-away filters are active.
    const extras = ['area', 'type', 'cuisine', 'within'].filter((k) => f[k]).length;
    badge.textContent = String(extras);
    badge.hidden = !extras;

    // Keep the URL in sync, omitting defaults.
    const out = new URLSearchParams();
    // Location-based settings stay out of shared links.
    for (const [k, v] of Object.entries(f)) if (k in DEFAULTS && v !== DEFAULTS[k] && !(k === 'at' && live)) out.set(k, v);
    const qs = out.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  // Phones show either the list or the map (see .explorer[data-view] in CSS).
  const explorer = document.getElementById('explorer')!;
  const viewBtns = document.querySelectorAll<HTMLButtonElement>('.view-toggle [data-view]');
  const isPhone = () => matchMedia('(max-width: 800px)').matches;
  function showView(view: 'list' | 'map', refit = true) {
    explorer.dataset.view = view;
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'map') {
      // The map may have been laid out while hidden.
      map.invalidateSize();
      if (refit && fitTo) map.fitBounds(fitTo, FIT_OPTS);
    }
    window.scrollTo({ top: Math.min(window.scrollY, explorer.offsetTop - 80) });
  }
  viewBtns.forEach((b) => b.addEventListener('click', () => showView(b.dataset.view as 'list' | 'map')));

  list.addEventListener('click', (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-locate]')?.dataset.locate;
    if (!id) return;
    const m = markers.get(id)!;
    if (isPhone()) showView('map', false);
    map.setView(m.getLatLng(), Math.max(map.getZoom(), 15));
    m.openPopup();
    if (!isPhone()) document.getElementById('map')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  const moreBtn = document.getElementById('more-filters') as HTMLButtonElement;
  moreBtn.addEventListener('click', () => {
    const open = form.classList.toggle('expanded');
    moreBtn.setAttribute('aria-expanded', String(open));
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
