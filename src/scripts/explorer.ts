import type { Marker, LngLatBounds } from 'maplibre-gl';
import { DEFAULT_OFF_TYPES, TYPE_ALIASES, type TypeKey } from '../data/taxonomy';
import { milesBetween, type LngLat } from '../lib/geo';
import { directionsFor } from '../lib/directions';
import { formatMiles, locationErrorMessage } from '../lib/location';
import { attachScrollUi } from './scroll-ui';
import { atlantaNow, closesLabel, openSpanAt, tonight, type Hours } from '../lib/hours';

interface Place {
  id: string;
  name: string;
  types: string[];
  typeLabel: string;
  /** Tag labels, e.g. "Cover charge". */
  tags: string[];
  cuisine: string[];
  area: string;
  lat: number;
  lng: number;
  hours: Hours;
  url: string;
  address: string;
}

const ATL_CENTER: LngLat = [-84.388, 33.749];

const FIT_OPTS = { padding: 40, maxZoom: 14, duration: 400 };
/** Phones: keep dots out from under the map buttons (top right) and the search box (bottom). */
const PHONE_FIT_PADDING = { top: 40, right: 64, bottom: 92, left: 32 };
const PLACE_ZOOM = 14;

const DEFAULTS: Record<string, string> = { night: 'tonight', at: '1260', q: '' };
/** Multi-select filters behind the "Filters" button. Several values in one filter match any of them. */
const EXTRA_KEYS = ['type', 'cuisine'] as const;
/** Where a visitor's filter choices are remembered between visits (this browser only). */
const PREFS_KEY = 'lateNightAtl:filters';
/** Only what kind of place: which night and what time start fresh each visit. */
interface Prefs {
  type: string[];
  cuisine: string[];
}

const escapeHtml = (s: string) =>
  s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const isPhoneQuery = matchMedia('(max-width: 800px)');

/**
 * Pinned toolbar. Publishes its height as --toolbar-h (the desktop map sits below it).
 * On phones, scrolling down slides the filter rows away, leaving only the results bar;
 * scrolling up, or focusing a filter, brings them back.
 */
function initStickyToolbar(phone: MediaQueryList) {
  const toolbar = document.getElementById('toolbar')!;
  const resultsBar = toolbar.querySelector<HTMLElement>('.results-bar')!;
  // Only the filters hold the rows open while focused (typing a search, picking a time);
  // the List/Map buttons below them shouldn't, or tapping List would pin them for good.
  const filters = toolbar.querySelector<HTMLElement>('#filters')!;
  const root = document.documentElement;

  const measure = () => {
    root.style.setProperty('--toolbar-h', `${toolbar.offsetHeight}px`);
    toolbar.style.setProperty('--collapse-by', `${resultsBar.offsetTop - 6}px`);
  };
  new ResizeObserver(measure).observe(toolbar);
  measure();

  let lastY = window.scrollY;
  const setCollapsed = (on: boolean) => toolbar.classList.toggle('is-collapsed', on && phone.matches);
  window.addEventListener(
    'scroll',
    () => {
      const y = window.scrollY;
      const dy = y - lastY;
      if (Math.abs(dy) < 8) return;
      lastY = y;
      const pastTop = y > toolbar.offsetHeight;
      if (dy > 0 && pastTop && !filters.contains(document.activeElement)) setCollapsed(true);
      else if (dy < 0 || !pastTop) setCollapsed(false);
    },
    { passive: true },
  );
  filters.addEventListener('focusin', () => setCollapsed(false));
  phone.addEventListener('change', () => setCollapsed(false));
  return toolbar;
}

export function initExplorer() {
  const places: Place[] = JSON.parse(document.getElementById('places-data')!.textContent!);
  const form = document.getElementById('filters') as HTMLFormElement;
  const list = document.getElementById('list')!;
  const count = document.getElementById('count')!;
  const empty = document.getElementById('empty')!;
  const listNote = document.getElementById('list-note')!;
  // Custom fading scrollbar and edge fades for the list (desktop, where it scrolls on its own).
  const refreshScrollUi = attachScrollUi(list);
  const atSelect = form.elements.namedItem('at') as HTMLSelectElement;
  const nightChip = document.getElementById('night-chip')!;
  const atChip = document.getElementById('at-chip')!;
  const cards = new Map(places.map((p) => [p.id, list.querySelector<HTMLElement>(`[data-id="${p.id}"]`)!]));

  type Result = { p: Place; end: number; label: string; miles: number };
  /** The latest results, for the map to draw whenever it's ready. */
  let latest: Result[] = [];

  /**
   * The map loads after the list: MapLibre is most of the page's code, so it comes in its
   * own chunk, fetched once the list and filters already work. Until then, map updates
   * are skipped; when it arrives it draws the current results.
   */
  const mapReady = import('./map').then(({ createMap, dot, locateControl, maplibregl, placeLabels, placeMarker }) => {
    const map = createMap('map');
    // "Near me" lives on the map, under + and −, as on place pages.
    const locate = locateControl(toggleNear, 'Near me');
    locate.button.id = 'near-me';
    map.addControl(locate.control, 'top-left');
    setLocateState = locate.setState;
    setLocateState(nearState);
    const markers = new Map(
      places.map((p) => [
        p.id,
        placeMarker([p.lng, p.lat], p.name).setPopup(new maplibregl.Popup({ offset: 14, maxWidth: '320px', focusAfterOpen: false })),
      ]),
    );
    const youEl = dot('you');
    youEl.title = 'You are here';
    const view = {
      map,
      markers,
      shown: new Set<Marker>(),
      setLabels: placeLabels(map, isPhoneQuery),
      youMarker: new maplibregl.Marker({ element: youEl, anchor: 'center' }).setLngLat(ATL_CENTER),
      bounds: (pts: LngLat[]) => pts.reduce((b, pt) => b.extend(pt), new maplibregl.LngLatBounds(pts[0], pts[0])),
    };
    mv = view;
    drawMap(true);
    map.once('idle', () => performance.mark('map-ready'));
    return view;
  });
  let mv: Awaited<typeof mapReady> | null = null;

  // "Near me": the browser's geolocation, only on request. The location stays in the page.
  let here: LngLat | null = null;
  const withinSel = form.elements.namedItem('within') as HTMLSelectElement;
  const geoMsg = document.getElementById('geo-msg')!;
  const say = (text = '') => {
    geoMsg.textContent = text;
    geoMsg.hidden = !text;
  };
  const withinChip = document.getElementById('within-chip')!;
  // The map's locate button arrives with the map; until then its state just waits here.
  let nearState: 'idle' | 'busy' | 'on' = 'idle';
  let setLocateState: (state: typeof nearState) => void = () => {};
  const setNear = (state: typeof nearState) => {
    nearState = state;
    setLocateState(state);
    const on = state === 'on';
    withinSel.disabled = !on;
    withinChip.hidden = !on;
    if (!on) withinSel.value = '';
  };

  function toggleNear() {
    if (here) {
      here = null;
      setNear('idle');
      say();
      update(true);
      return;
    }
    if (!window.isSecureContext || !('geolocation' in navigator)) {
      say('Location isn’t available here. It needs a secure (https) connection and a browser that supports it.');
      return;
    }
    setNear('busy');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        here = [pos.coords.longitude, pos.coords.latitude];
        setNear('on');
        const miles = milesBetween(here, ATL_CENTER);
        say(miles > 40 ? `You look to be about ${Math.round(miles)} miles from Atlanta. Distances are from where you are now.` : '');
        update(true);
      },
      (err) => {
        setNear('idle');
        say(locationErrorMessage(err.code));
      },
      { enableHighAccuracy: false, timeout: 15_000, maximumAge: 300_000 },
    );
  }

  // Where the filters start. A link with filters in it (a shared view) shows exactly that.
  // Otherwise tonight at 9 PM, with the visitor's own last Type and Cuisine choices,
  // remembered in this browser, or by default any cuisine and every type but errands
  // (grocery, pharmacy).
  const params = new URLSearchParams(location.search);
  const checkboxes = (name: string) => [...form.querySelectorAll<HTMLInputElement>(`input[type=checkbox][name="${name}"]`)];
  const typeBoxes = checkboxes('type');
  const defaultTypes = typeBoxes.map((b) => b.value).filter((v) => !DEFAULT_OFF_TYPES.includes(v as TypeKey));

  const savedPrefs = (): Partial<Prefs> => {
    try {
      const v: unknown = JSON.parse(localStorage.getItem(PREFS_KEY) ?? 'null');
      return v && typeof v === 'object' ? (v as Partial<Prefs>) : {};
    } catch {
      return {};
    }
  };
  const savePrefs = () => {
    const prefs: Prefs = {
      type: typeBoxes.filter((b) => b.checked).map((b) => b.value),
      cuisine: checkboxes('cuisine').filter((b) => b.checked).map((b) => b.value),
    };
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify(prefs));
    } catch {
      // Storage blocked (private mode, settings): the choices last for this visit only.
    }
  };
  const tick = (name: string, values: unknown) => {
    if (!Array.isArray(values)) return false;
    for (const box of checkboxes(name)) box.checked = values.includes(box.value);
    return true;
  };

  const shared = [...params.keys()].some((k) => k in DEFAULTS || (EXTRA_KEYS as readonly string[]).includes(k));
  if (shared) {
    for (const box of typeBoxes) box.checked = !params.has('type') && defaultTypes.includes(box.value);
    for (const [name, value] of params) {
      if ((EXTRA_KEYS as readonly string[]).includes(name)) {
        const v = name === 'type' ? (TYPE_ALIASES[value] ?? value) : value;
        for (const box of checkboxes(name)) if (box.value === v) box.checked = true;
        continue;
      }
      const el = form.elements.namedItem(name) as HTMLInputElement | HTMLSelectElement | null;
      if (el) el.value = value;
    }
  } else {
    const saved = savedPrefs();
    if (!tick('type', saved.type)) tick('type', defaultTypes);
    tick('cuisine', saved.cuisine);
  }

  let fitTo: LngLatBounds | null = null;
  const clearBtn = document.getElementById('clear-filters') as HTMLButtonElement;
  const menus = [...form.querySelectorAll<HTMLDetailsElement>('.chip-menu')];

  const popupHtml = (p: Place, status: string) =>
    `<a class="popup-name" href="${p.url}">${escapeHtml(p.name)}</a>` +
    `<div class="popup-meta">${escapeHtml(p.typeLabel)} · ${escapeHtml(p.area)}</div>` +
    `<div class="popup-status">${escapeHtml(status)}${p.tags.map((t) => ` <span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` +
    `<div class="popup-actions">` +
    `<a class="btn btn-primary" href="${escapeHtml(directionsFor(p.address).main.url)}">Directions</a>` +
    `<a class="btn" href="${p.url}">Details</a>` +
    `</div>`;

  /** Frame the current results. Skipped while the map is hidden (phones, list view). */
  let framed = false;
  function refit() {
    if (!mv || !fitTo || !mv.map.getContainer().offsetWidth) return;
    const padding = isPhoneQuery.matches ? PHONE_FIT_PADDING : FIT_OPTS.padding;
    mv.map.fitBounds(fitTo, { ...FIT_OPTS, padding, duration: framed ? FIT_OPTS.duration : 0 }); // no fly-in on first view
    framed = true;
  }

  /** Bring the map in line with the latest results (no-op until the map has loaded). */
  function drawMap(fit: boolean) {
    if (!mv) return;
    for (const m of mv.shown) m.remove();
    mv.shown.clear();
    for (const { p, label } of latest) {
      const m = mv.markers.get(p.id)!;
      m.getPopup()!.setHTML(popupHtml(p, label));
      mv.shown.add(m.addTo(mv.map));
    }
    if (here) mv.youMarker.setLngLat(here).addTo(mv.map);
    else mv.youMarker.remove();
    // Frame the user and the closest few results, or all results.
    const pts: LngLat[] = latest.slice(0, here ? 5 : undefined).map(({ p }) => [p.lng, p.lat]);
    if (here) pts.unshift(here);
    fitTo = pts.length ? mv.bounds(pts) : null;
    // Names for the results, best first, so they win when two compete for space.
    mv.setLabels(latest.map(({ p }) => ({ name: p.name, at: [p.lng, p.lat] })));
    if (fit) refit();
  }

  function update(fit: boolean) {
    const data = new FormData(form);
    const f = Object.fromEntries(data) as Record<string, string>;
    const picked = Object.fromEntries(EXTRA_KEYS.map((k) => [k, new Set(data.getAll(k) as string[])]));
    const { type, cuisine } = picked;
    const live = f.night === 'now';
    atSelect.disabled = live;
    nightChip.classList.toggle('is-set', f.night !== 'tonight');
    atChip.classList.toggle('is-set', !live && f.at !== DEFAULTS.at);
    const now = atlantaNow();
    const night = live ? now.day : f.night === 'tonight' ? tonight() : Number(f.night);
    const t = live ? now.minutes : Number(f.at);
    const q = (f.q ?? '').trim().toLowerCase();

    const within = Number(f.within) || Infinity;

    const results: Result[] = [];
    for (const p of places) {
      const span = openSpanAt(p.hours, night, t);
      const miles = here ? milesBetween(here, [p.lng, p.lat]) : NaN;
      const ok =
        span &&
        !(miles > within) &&
        (!type.size || p.types.some((t) => type.has(t))) &&
        (!cuisine.size || p.cuisine.some((c) => cuisine.has(c))) &&
        (!q || [p.name, p.area, p.typeLabel, ...p.cuisine, ...p.tags].join(' ').toLowerCase().includes(q));
      cards.get(p.id)!.hidden = !ok;
      if (ok) results.push({ p, end: span[1], label: closesLabel(span[1], span[0]), miles });
    }

    // Nearest first when location is on, otherwise latest-closing first.
    results.sort((a, b) => (here ? a.miles - b.miles : b.end - a.end) || a.p.name.localeCompare(b.p.name));
    for (const { p, label, miles } of results) {
      const card = cards.get(p.id)!;
      card.querySelector('[data-status]')!.textContent = label;
      card.querySelector('[data-distance]')!.textContent = here ? formatMiles(miles) : '';
      list.appendChild(card);
    }

    list.appendChild(listNote); // keep the note after the re-sorted cards
    refreshScrollUi();
    listNote.hidden = !results.length;
    count.textContent = `${results.length} ${results.length === 1 ? 'place' : 'places'}`;
    empty.hidden = results.length > 0;

    latest = results;
    drawMap(fit);

    // Menu labels and active states; "Clear filters" (desktop) once any is in use.
    const extras = EXTRA_KEYS.reduce((n, k) => n + picked[k].size, 0);
    withinChip.classList.toggle('is-set', !!f.within);
    for (const menu of menus) {
      const on = checkboxes(menu.dataset.filter!).filter((b) => b.checked);
      menu.querySelector('.menu-text')!.textContent =
        on.length === 0 ? menu.dataset.all! : on.length === 1 ? on[0].parentElement!.textContent! : `${on.length} ${menu.dataset.plural}`;
      menu.classList.toggle('is-active', on.length > 0);
    }
    clearBtn.hidden = !extras;

    // Keep the URL in sync, omitting defaults.
    const out = new URLSearchParams();
    // Location-based settings stay out of shared links.
    for (const [k, v] of Object.entries(f)) if (k in DEFAULTS && v !== DEFAULTS[k] && !(k === 'at' && live)) out.set(k, v);
    for (const k of EXTRA_KEYS) {
      if (k === 'type') {
        // Types only when they differ from the default; "all" when none are ticked.
        const same = picked.type.size === defaultTypes.length && defaultTypes.every((v) => picked.type.has(v));
        if (same) continue;
        if (!picked.type.size) out.append('type', 'all');
      }
      for (const v of picked[k]) out.append(k, v);
    }
    const qs = out.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  const toolbar = initStickyToolbar(isPhoneQuery);


  // Phones show either the list or the map (see .explorer[data-view] in CSS).
  const explorer = document.getElementById('explorer')!;
  const viewBtns = document.querySelectorAll<HTMLButtonElement>('.view-toggle [data-view]');
  const isPhone = () => isPhoneQuery.matches;
  function showView(view: 'list' | 'map', refitMap = true) {
    explorer.dataset.view = view;
    viewBtns.forEach((b) => b.setAttribute('aria-pressed', String(b.dataset.view === view)));
    if (view === 'map') {
      // The map may have been laid out while hidden.
      mv?.map.resize();
      if (refitMap) refit();
    }
    window.scrollTo({ top: Math.min(window.scrollY, explorer.offsetTop - toolbar.offsetHeight - 12) });
  }
  viewBtns.forEach((b) => b.addEventListener('click', () => showView(b.dataset.view as 'list' | 'map')));

  list.addEventListener('click', async (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-locate]')?.dataset.locate;
    if (!id) return;
    if (isPhone()) showView('map', false);
    const { map, markers } = await mapReady; // usually long since loaded
    const m = markers.get(id)!;
    map.jumpTo({ center: m.getLngLat(), zoom: Math.max(map.getZoom(), PLACE_ZOOM) });
    if (!m.getPopup()!.isOpen()) m.togglePopup();
    if (!isPhone()) document.getElementById('map')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Each menu's own Clear.
  for (const menu of menus) {
    menu.querySelector('.menu-clear')!.addEventListener('click', () => {
      for (const box of checkboxes(menu.dataset.filter!)) box.checked = false;
      savePrefs();
      update(true);
    });
  }
  clearBtn.addEventListener('click', () => {
    for (const k of EXTRA_KEYS) for (const box of checkboxes(k)) box.checked = false;
    savePrefs();
    update(true);
  });

  // Filter menus: one open at a time; close on an outside click or Escape.
  for (const menu of menus) {
    menu.addEventListener('toggle', () => {
      if (menu.open) for (const other of menus) if (other !== menu) other.open = false;
    });
  }
  document.addEventListener('click', (e) => {
    for (const menu of menus) if (menu.open && !menu.contains(e.target as Node)) menu.open = false;
  });
  form.addEventListener('keydown', (e) => {
    const menu = (e.target as HTMLElement).closest<HTMLDetailsElement>('.chip-menu');
    if (e.key === 'Escape' && menu?.open) {
      menu.open = false;
      menu.querySelector('summary')!.focus();
    }
  });

  let timer: number | undefined;
  form.addEventListener('input', (e) => {
    if (['type', 'cuisine'].includes((e.target as HTMLInputElement).name)) savePrefs();
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
  // Load-time marks (visible in the browser's Performance panel): list usable; the map's
  // 'map-ready' is set when it first finishes drawing.
  performance.mark('list-ready');
}
