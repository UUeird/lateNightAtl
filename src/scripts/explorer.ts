import type { Marker, LngLatBounds, Popup } from 'maplibre-gl';
import { DEFAULT_OFF_CUISINES, DEFAULT_OFF_TYPES, TYPE_ALIASES, cuisineGroup, type TypeKey } from '../data/taxonomy';
import { milesBetween, type LngLat } from '../lib/geo';
import { directionsFor } from '../lib/directions';
import { formatMiles, locationErrorMessage } from '../lib/location';
import { attachScrollUi } from './scroll-ui';
import { matchesType } from '../lib/match';
import { DAY_NAMES, atlantaNow, closesLabel, defaultNight, defaultOpenUntil, formatTime, openSpanAt, tonight, tonightMinutes, type Hours } from '../lib/hours';

interface Place {
  id: string;
  name: string;
  types: string[];
  typeLabel: string;
  /** Tag labels, e.g. "Cover charge". */
  tags: string[];
  cuisine: string[];
  /** The cuisines' groups in the Type menu (see CUISINE_GROUPS). */
  cuisineGroups: string[];
  area: string;
  lat: number;
  lng: number;
  hours: Hours;
  url: string;
  address: string;
}

const ATL_CENTER: LngLat = [-84.388, 33.749];

const FIT_OPTS = { padding: 40, maxZoom: 14, duration: 400 };
/** Phones: keep dots clear of the map buttons (top right). The header (top) and the
    floating filters (bottom), which the map runs behind, are measured and added to this. */
const PHONE_FIT_PADDING = { top: 24, right: 64, bottom: 24, left: 32 };
const PLACE_ZOOM = 14;

/**
 * Where When starts, fixed for the visit: "Right now" from 9 PM, otherwise "Tonight";
 * "Open until" half an hour out (9 PM in the daytime), for when Tonight is picked.
 */
const DEFAULTS: Record<string, string> = { night: defaultNight(), at: String(defaultOpenUntil()), q: '' };
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
 * Publishes the toolbar's height as --toolbar-h, for layouts that sit below it, and
 * --overlay-h: how far down the page the header and toolbar reach, which on phones float
 * over the top of the map.
 */
function measureToolbar() {
  const toolbar = document.getElementById('toolbar')!;
  const header = document.querySelector<HTMLElement>('.site-header')!;
  const filterBar = document.getElementById('filter-bar')!;
  const measure = () => {
    const root = document.documentElement.style;
    root.setProperty('--toolbar-h', `${toolbar.offsetHeight}px`);
    root.setProperty('--overlay-h', `${toolbar.getBoundingClientRect().bottom + window.scrollY}px`);
    // Phones: how much of the screen's foot the floating filters take.
    root.setProperty('--bottom-h', `${Math.max(0, window.innerHeight - filterBar.getBoundingClientRect().top)}px`);
  };
  const observer = new ResizeObserver(measure);
  observer.observe(toolbar);
  observer.observe(header);
  observer.observe(filterBar);
  addEventListener('resize', measure);
  measure();
}

/** Below this sideways drag, in px, the list snaps back to where it was. */
const DRAG_COMMIT_PX = 60;

/**
 * Phones: the list is a panel over the map. A tap on the map's edge tab opens it; the close button, a tap on the dimmed map, Escape or a swipe right
 * closes it. Dragging the tab or the panel moves it with the finger.
 */
function initListDrawer(phone: MediaQueryList) {
  const explorer = document.getElementById('explorer')!;
  const panel = document.getElementById('list-panel')!;
  const scrim = document.getElementById('list-scrim')!;
  const closeBtn = document.getElementById('list-close') as HTMLButtonElement;
  const tab = document.getElementById('list-tab') as HTMLButtonElement;
  const isOpen = () => explorer.dataset.list === 'open';

  function set(open: boolean, focus = true) {
    if (open === isOpen()) return;
    explorer.dataset.list = open ? 'open' : 'closed';
    tab.setAttribute('aria-expanded', String(open));
    panel.toggleAttribute('inert', !open && phone.matches);
    if (focus) (open ? closeBtn : tab).focus({ preventScroll: true });
  }
  panel.toggleAttribute('inert', phone.matches);
  phone.addEventListener('change', () => {
    set(false, false);
    panel.toggleAttribute('inert', phone.matches);
  });

  closeBtn.addEventListener('click', () => set(false));
  scrim.addEventListener('click', () => set(false));
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape' && isOpen() && phone.matches) set(false);
  });

  /** Follow a sideways drag. `from`: where the panel starts (0 = open, 1 = closed). */
  function drag(handle: HTMLElement, from: 0 | 1) {
    let start: { x: number; y: number; id: number } | null = null;
    let sideways: boolean | null = null; // decided on the first real move
    let dx = 0;
    let dragged = false;
    const width = () => panel.offsetWidth;
    const place = (shift: number) => {
      panel.style.transform = `translateX(${shift}px)`;
      scrim.style.opacity = String(1 - shift / width());
    };
    const end = (commit: boolean) => {
      if (!start) return;
      panel.classList.remove('is-dragging');
      scrim.classList.remove('is-dragging');
      panel.style.transform = scrim.style.opacity = '';
      start = null;
      if (commit) set(from === 1);
    };
    handle.addEventListener('pointerdown', (e) => {
      if (!phone.matches || e.pointerType === 'mouse' || isOpen() !== (from === 0)) return;
      start = { x: e.clientX, y: e.clientY, id: e.pointerId };
      sideways = null;
      dx = 0;
      dragged = false;
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start || e.pointerId !== start.id) return;
      dx = e.clientX - start.x;
      const dy = e.clientY - start.y;
      if (sideways === null) {
        if (Math.hypot(dx, dy) < 8) return;
        sideways = Math.abs(dx) > Math.abs(dy);
        if (!sideways) return end(false); // a scroll, not a swipe
        dragged = true;
        handle.setPointerCapture(e.pointerId);
        panel.classList.add('is-dragging');
        scrim.classList.add('is-dragging');
      }
      const w = width();
      place(Math.min(w, Math.max(0, from * w + dx)));
    });
    handle.addEventListener('pointerup', () => end(sideways === true && (from === 1 ? -dx : dx) > DRAG_COMMIT_PX));
    handle.addEventListener('pointercancel', () => end(false));
    return () => dragged;
  }
  const tabDragged = drag(tab, 1);
  drag(panel, 0);
  // A tap on the tab (not the end of a drag) opens the list too.
  tab.addEventListener('click', () => {
    if (!tabDragged()) set(true);
  });

  return { close: () => set(false, false) };
}

/** How long a menu's choices take to fade away on phones (matches CSS), in ms. */
const FADE_OUT_MS = 160;

/**
 * Filter menus (When, Type), one open at a time. Desktop: pop-overs. Phones: the map
 * stays put and dims, and the menu's choices pop in over it as separate floating pills.
 * Switching straight to the other menu swaps the pills in place (the dim stays);
 * closing fades them out.
 */
function initFilterSheet(phone: MediaQueryList, menus: HTMLDetailsElement[]) {
  const explorer = document.getElementById('explorer')!;
  let current: HTMLDetailsElement | null = null;
  let closing: { menu: HTMLDetailsElement; timer: number } | null = null;

  const finishClosing = () => {
    if (!closing) return;
    clearTimeout(closing.timer);
    closing.menu.open = false;
    closing.menu.classList.remove('is-closing');
    closing = null;
  };

  function show(next: HTMLDetailsElement | null) {
    if (next === current) return;
    const prev = current;
    current = next;
    finishClosing();
    explorer.classList.toggle('is-dimmed', !!next && phone.matches);
    if (!phone.matches) {
      for (const m of menus) m.open = m === next;
      return;
    }
    for (const m of menus) m.classList.remove('is-switching');
    if (next) {
      if (prev) {
        prev.open = false;
        next.classList.add('is-switching'); // swap in place, without popping in again
      }
      next.open = true;
    } else if (prev) {
      prev.classList.add('is-closing'); // fade the pills out, then close
      closing = { menu: prev, timer: window.setTimeout(finishClosing, FADE_OUT_MS) };
    }
  }

  for (const menu of menus) {
    menu.querySelector('summary')!.addEventListener('click', (e) => {
      e.preventDefault(); // opening and closing go through show()
      show(current === menu ? null : menu);
    });
  }
  phone.addEventListener('change', () => {
    finishClosing();
    explorer.classList.toggle('is-dimmed', !!current && phone.matches);
  });
  return { show, current: () => current };
}

export function initExplorer() {
  const places: Place[] = JSON.parse(document.getElementById('places-data')!.textContent!);
  const form = document.getElementById('filters') as HTMLFormElement;
  const list = document.getElementById('list')!;
  const count = document.getElementById('count')!;
  // Phones: the tray's header shows the count, but only when the list runs past the fold.
  const listCount = document.getElementById('list-count')!;
  const syncListCount = () => {
    listCount.textContent = list.scrollHeight > list.clientHeight + 1 ? count.textContent : '';
  };
  new ResizeObserver(syncListCount).observe(list);
  const empty = document.getElementById('empty')!;
  const listNote = document.getElementById('list-note')!;
  // Custom fading scrollbar and edge fades for the list (desktop, where it scrolls on its own).
  const refreshScrollUi = attachScrollUi(list);
  const radios = (name: string) => form.elements.namedItem(name) as RadioNodeList;
  const whenMenu = document.getElementById('when-menu') as HTMLDetailsElement;
  const whenTimes = document.getElementById('when-times') as HTMLFieldSetElement;
  const cards = new Map(places.map((p) => [p.id, list.querySelector<HTMLElement>(`[data-id="${p.id}"]`)!]));

  /** `notYet`: tonight's view, and the place opens later than now. */
  type Result = { p: Place; end: number; label: string; miles: number; notYet: boolean };
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
        placeMarker([p.lng, p.lat], p.name).setPopup(
          // Never wider than the screen, less a margin each side.
          new maplibregl.Popup({ offset: 14, maxWidth: 'min(320px, calc(100vw - 32px))', focusAfterOpen: false }),
        ),
      ]),
    );
    // An opened popup that runs off the visible map (or under the chips or the search box,
    // which float over it on phones) pans the map just enough to show all of it.
    const keepInView = (popup: Popup, passes = 3) => {
      const el = popup.getElement();
      if (!el) return;
      const r = el.getBoundingClientRect();
      const m = map.getContainer().getBoundingClientRect();
      const phone = isPhoneQuery.matches;
      const margin = 8;
      const area = {
        left: m.left + margin,
        right: m.right - margin,
        top: Math.max(m.top, phone ? document.getElementById('toolbar')!.getBoundingClientRect().bottom : 0) + margin,
        bottom: (phone ? document.getElementById('filter-bar')!.getBoundingClientRect().top : m.bottom) - margin,
      };
      let dx = r.left < area.left || r.width > area.right - area.left ? r.left - area.left : Math.max(0, r.right - area.right);
      let dy = r.top < area.top || r.height > area.bottom - area.top ? r.top - area.top : Math.max(0, r.bottom - area.bottom);
      // Clear of the map buttons (+, −, Near me) too: beside them if there's room, else below.
      const btns = [...map.getContainer().querySelectorAll('.maplibregl-ctrl-top-left > .maplibregl-ctrl')].map((b) => b.getBoundingClientRect());
      if (btns.length) {
        const c = {
          left: Math.min(...btns.map((b) => b.left)) - margin,
          right: Math.max(...btns.map((b) => b.right)) + margin,
          bottom: Math.max(...btns.map((b) => b.bottom)) + margin,
          top: Math.min(...btns.map((b) => b.top)) - margin,
        };
        const p = { left: r.left - dx, right: r.right - dx, top: r.top - dy, bottom: r.bottom - dy };
        if (p.left < c.right && p.right > c.left && p.top < c.bottom && p.bottom > c.top) {
          const onRight = c.left > (m.left + m.right) / 2;
          const room = onRight ? c.left - area.left : area.right - c.right;
          if (r.width <= room) dx += onRight ? p.right - c.left : p.left - c.right;
          else dy -= c.bottom - p.top; // below them (the map moves down)
        }
      }
      if (Math.abs(dx) >= 1 || Math.abs(dy) >= 1) {
        map.panBy([dx, dy], { duration: 300 });
        // Moving can change which side of its dot the popup hangs on: check again once
        // it settles, a couple of times at most.
        if (passes > 1) map.once('moveend', () => popup.isOpen() && keepInView(popup, passes - 1));
      }
    };
    for (const m of markers.values()) {
      const popup = m.getPopup()!;
      popup.on('open', () => requestAnimationFrame(() => keepInView(popup)));
    }
    // A place's dot and name light up together when either is hovered (mouse only:
    // a tap shouldn't leave one lit), and clicking the name opens it like the dot.
    let lit: string | null = null;
    const highlight = (id: string | null) => {
      if (id === lit) return;
      if (lit) markers.get(lit)?.getElement().classList.remove('is-hover');
      lit = id;
      if (id) markers.get(id)?.getElement().classList.add('is-hover');
      labels.highlight(id);
    };
    const labels = placeLabels(map, isPhoneQuery, {
      click: (id) => {
        const m = markers.get(id)!;
        if (!m.getPopup()!.isOpen()) m.togglePopup();
      },
      hover: highlight,
    });
    for (const [id, m] of markers) {
      const el = m.getElement();
      el.addEventListener('pointerenter', (e) => e.pointerType === 'mouse' && highlight(id));
      el.addEventListener('pointerleave', (e) => e.pointerType === 'mouse' && lit === id && highlight(null));
    }
    const youEl = dot('you');
    youEl.title = 'You are here';
    const view = {
      map,
      markers,
      shown: new Set<Marker>(),
      setLabels: (points: { id: string; name: string; at: LngLat }[]) => {
        lit = null;
        labels.set(points);
      },
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
  // Otherwise right now (from 9 PM) or tonight, open until half an hour out, with the visitor's own last Type and Cuisine choices,
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
      // The usual food (all but fast food) is saved as none, every cuisine as "all".
      cuisine: foodPicks() === 'default' ? [] : foodPicks() === 'all' ? ['all'] : checkboxes('cuisine').filter((b) => b.checked).map((b) => b.value),
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

  radios('night').value = DEFAULTS.night;
  radios('at').value = DEFAULTS.at;
  const shared = [...params.keys()].some((k) => k in DEFAULTS || (EXTRA_KEYS as readonly string[]).includes(k));
  if (shared) {
    for (const box of typeBoxes) box.checked = !params.has('type') && defaultTypes.includes(box.value);
    for (const [name, value] of params) {
      if ((EXTRA_KEYS as readonly string[]).includes(name)) {
        const v = name === 'type' ? (TYPE_ALIASES[value] ?? value) : cuisineGroup(value);
        for (const box of checkboxes(name)) if (box.value === v || (name === 'cuisine' && v === 'all')) box.checked = true;
        continue;
      }
      const el = form.elements.namedItem(name) as RadioNodeList | HTMLSelectElement | HTMLInputElement | null;
      if (el) el.value = value;
    }
  } else {
    const saved = savedPrefs();
    if (!tick('type', saved.type)) tick('type', defaultTypes);
    const savedCuisine = Array.isArray(saved.cuisine) ? saved.cuisine.map(cuisineGroup) : saved.cuisine;
    tick('cuisine', savedCuisine?.includes('all') ? checkboxes('cuisine').map((b) => b.value) : savedCuisine);
  }
  // A cuisine is a kind of food: picking one picks Food.
  const foodBox = typeBoxes.find((b) => b.value === 'food');
  // Food is the parent of the cuisines: ticked with all of them, a minus with some.
  // Food on its own (the default, or a link's type=food) means the usual food: every
  // cuisine but fast food.
  const usualFood = (box: HTMLInputElement) => !DEFAULT_OFF_CUISINES.includes(box.value);
  /** Which cuisines are picked: none, the usual food, all of them, or some other set. */
  const foodPicks = (): 'none' | 'default' | 'all' | 'some' => {
    const boxes = checkboxes('cuisine');
    const on = boxes.filter((b) => b.checked);
    if (!on.length) return 'none';
    if (on.length === boxes.length) return 'all';
    return boxes.every((b) => b.checked === usualFood(b)) ? 'default' : 'some';
  };
  if (foodBox && checkboxes('cuisine').some((b) => b.checked)) foodBox.checked = true;
  else if (foodBox?.checked) for (const box of checkboxes('cuisine')) box.checked = usualFood(box);
  /** Food was at its minus before the latest tap (a tap clears the minus). */
  let foodWasPartial = false;

  let fitTo: LngLatBounds | null = null;
  const clearBtn = document.getElementById('clear-filters') as HTMLButtonElement;
  const menus = [...form.querySelectorAll<HTMLDetailsElement>('.chip-menu')];
  /** The menus of checkboxes (Type), as opposed to When. */
  const filterMenus = menus.filter((m) => m.dataset.filter);

  const popupHtml = (p: Place, status: string, notYet = false) =>
    `<a class="popup-name" href="${p.url}">${escapeHtml(p.name)}</a>` +
    `<div class="popup-meta">${escapeHtml(p.typeLabel)} · ${escapeHtml(p.area)}</div>` +
    `<div class="popup-status${notYet ? ' not-yet' : ''}">${escapeHtml(status)}${p.tags.map((t) => ` <span class="tag">${escapeHtml(t)}</span>`).join('')}</div>` +
    `<div class="popup-actions">` +
    `<a class="btn btn-primary" href="${escapeHtml(directionsFor(p.address).main.url)}">Directions</a>` +
    `<a class="btn" href="${p.url}">Details</a>` +
    `</div>`;

  /** Frame the current results. Skipped while the map is hidden (phones, list view). */
  let framed = false;
  function refit() {
    if (!mv || !fitTo || !mv.map.getContainer().offsetWidth) return;
    // Phones: the header and chips float over the top of the map.
    const overlayH = document.getElementById('toolbar')!.getBoundingClientRect().bottom - mv.map.getContainer().getBoundingClientRect().top;
    const bottomH = mv.map.getContainer().getBoundingClientRect().bottom - document.getElementById('filter-bar')!.getBoundingClientRect().top;
    const padding = isPhoneQuery.matches
      ? { ...PHONE_FIT_PADDING, top: PHONE_FIT_PADDING.top + Math.max(0, overlayH), bottom: 24 + Math.max(0, bottomH) }
      : FIT_OPTS.padding;
    mv.map.fitBounds(fitTo, { ...FIT_OPTS, padding, duration: framed ? FIT_OPTS.duration : 0 }); // no fly-in on first view
    framed = true;
  }

  /** Bring the map in line with the latest results (no-op until the map has loaded). */
  function drawMap(fit: boolean) {
    if (!mv) return;
    for (const m of mv.shown) m.remove();
    mv.shown.clear();
    for (const { p, label, notYet } of latest) {
      const m = mv.markers.get(p.id)!;
      m.getPopup()!.setHTML(popupHtml(p, label, notYet));
      m.getElement().classList.toggle('not-yet', notYet);
      mv.shown.add(m.addTo(mv.map));
    }
    if (here) mv.youMarker.setLngLat(here).addTo(mv.map);
    else mv.youMarker.remove();
    // Frame the user and the closest few results, or all results.
    const pts: LngLat[] = latest.slice(0, here ? 5 : undefined).map(({ p }) => [p.lng, p.lat]);
    if (here) pts.unshift(here);
    fitTo = pts.length ? mv.bounds(pts) : null;
    // Names for the results, best first, so they win when two compete for space.
    mv.setLabels(latest.map(({ p }) => ({ id: p.id, name: p.name, at: [p.lng, p.lat] })));
    if (fit) refit();
  }

  function update(fit: boolean) {
    // "Right now" makes the time moot. Settled before reading the form, which skips
    // disabled fields: switching back from "Right now" must bring the time back with it.
    whenTimes.disabled = radios('night').value === 'now';
    const data = new FormData(form);
    const f = Object.fromEntries(data) as Record<string, string>;
    const picked = Object.fromEntries(EXTRA_KEYS.map((k) => [k, new Set(data.getAll(k) as string[])]));
    const { type } = picked;
    // Every cuisine ticked is every food place, so no cuisine narrows anything.
    const picks = foodPicks();
    const cuisine = picks === 'all' ? new Set<string>() : picked.cuisine;
    const live = f.night === 'now';
    const now = atlantaNow();
    const night = live ? now.day : f.night === 'tonight' ? tonight() : Number(f.night);
    const t = live ? now.minutes : Number(f.at);
    // Tonight, a place that opens later than now still shows, dimmed and marked.
    const nowInNight = !live && night === tonight() ? tonightMinutes() : Infinity;
    const q = (f.q ?? '').trim().toLowerCase();

    const within = Number(f.within) || Infinity;

    const results: Result[] = [];
    for (const p of places) {
      const span = openSpanAt(p.hours, night, t);
      const miles = here ? milesBetween(here, [p.lng, p.lat]) : NaN;
      const ok =
        span &&
        !(miles > within) &&
        matchesType({ types: p.types, cuisine: p.cuisineGroups }, type, cuisine) &&
        (!q || [p.name, p.area, p.typeLabel, ...p.cuisine, ...p.tags].join(' ').toLowerCase().includes(q));
      cards.get(p.id)!.hidden = !ok;
      if (!ok) continue;
      const notYet = span[0] > nowInNight;
      const label = notYet ? `Not open yet · ${formatTime(span[0])} – ${formatTime(span[1])}` : closesLabel(span[1], span[0]);
      results.push({ p, end: span[1], label, miles, notYet });
    }

    // Open now before not open yet; then nearest first when location is on, otherwise latest-closing first.
    results.sort(
      (a, b) => Number(a.notYet) - Number(b.notYet) || (here ? a.miles - b.miles : b.end - a.end) || a.p.name.localeCompare(b.p.name),
    );
    for (const { p, label, miles, notYet } of results) {
      const card = cards.get(p.id)!;
      card.classList.toggle('not-yet', notYet);
      card.querySelector('[data-status]')!.textContent = label;
      card.querySelector('[data-distance]')!.textContent = here ? formatMiles(miles) : '';
      list.appendChild(card);
    }

    list.appendChild(listNote); // keep the note after the re-sorted cards
    refreshScrollUi();
    listNote.hidden = !results.length;
    count.textContent = `${results.length} ${results.length === 1 ? 'place' : 'places'}`;
    syncListCount();
    empty.hidden = results.length > 0;

    latest = results;
    drawMap(fit);

    // Menu labels and active states; "Clear filters" (desktop) once any is in use.
    const extras = type.size + cuisine.size;
    withinChip.classList.toggle('is-set', !!f.within);
    for (const menu of filterMenus) {
      // What's picked, in words: "Food" for the usual food or all of it, else the cuisines.
      const boxes = [...menu.querySelectorAll<HTMLInputElement>('input[type=checkbox]:checked')];
      const wholeFood = picks === 'all' || picks === 'default';
      const words = boxes
        .filter((b) => (b === foodBox ? wholeFood : b.name !== 'cuisine' || !wholeFood))
        .map((b) => b.parentElement!.textContent!);
      menu.querySelector('.menu-text')!.textContent =
        words.length === 0 ? menu.dataset.all! : words.length === 1 ? words[0] : `${words.length} ${menu.dataset.plural}`;
      menu.classList.toggle('is-active', boxes.length > 0);
    }
    // Food shows a minus while only some of its cuisines are picked.
    if (foodBox) foodBox.indeterminate = foodWasPartial = picks === 'default' || picks === 'some';
    // When: e.g. "Tonight · till 12:30 AM" (phones: "Tonight, 12:30 AM").
    const nightWord = f.night === 'tonight' ? 'Tonight' : DAY_NAMES[night].slice(0, 3);
    const time = formatTime(t).replace('midnight', '12 AM');
    whenMenu.querySelector('.when-text')!.textContent = live ? 'Right now' : `${nightWord}${f.night === 'tonight' ? '' : ' night'} · till ${time}`;
    whenMenu.querySelector('.when-short')!.textContent = live ? 'Right now' : `${nightWord}, ${time}`;
    whenMenu.classList.toggle('is-active', f.night !== DEFAULTS.night || (!live && f.at !== DEFAULTS.at));
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
      if (k === 'cuisine' && picks === 'default') continue; // the usual food: no need to say
      if (k === 'cuisine' && picks === 'all') {
        out.append('cuisine', 'all');
        continue;
      }
      for (const v of picked[k]) out.append(k, v);
    }
    const qs = out.toString();
    history.replaceState(null, '', qs ? `?${qs}` : location.pathname);
  }

  measureToolbar();


  const isPhone = () => isPhoneQuery.matches;
  const drawer = initListDrawer(isPhoneQuery);

  list.addEventListener('click', async (e) => {
    const id = (e.target as HTMLElement).closest<HTMLElement>('[data-locate]')?.dataset.locate;
    if (!id) return;
    if (isPhone()) drawer.close();
    const { map, markers } = await mapReady; // usually long since loaded
    const m = markers.get(id)!;
    map.jumpTo({ center: m.getLngLat(), zoom: Math.max(map.getZoom(), PLACE_ZOOM) });
    if (!m.getPopup()!.isOpen()) m.togglePopup();
    if (!isPhone()) document.getElementById('map')!.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
  });

  // Each menu's own Clear.
  for (const menu of filterMenus) {
    menu.querySelector('.menu-clear')!.addEventListener('click', () => {
      for (const box of menu.querySelectorAll<HTMLInputElement>('input[type=checkbox]')) box.checked = false;
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
  const sheet = initFilterSheet(isPhoneQuery, menus);
  document.addEventListener('click', (e) => {
    if (sheet.current() && !sheet.current()!.contains(e.target as Node)) sheet.show(null);
  });
  form.addEventListener('keydown', (e) => {
    const menu = (e.target as HTMLElement).closest<HTMLDetailsElement>('.chip-menu');
    if (e.key === 'Escape' && menu && menu === sheet.current()) {
      sheet.show(null);
      menu.querySelector('summary')!.focus();
    }
  });

  let timer: number | undefined;
  form.addEventListener('input', (e) => {
    const input = e.target as HTMLInputElement;
    // Food and its cuisines move together. Food on ticks the usual food (all but fast
    // food); tapped at its minus, every cuisine; off, none. Food is on while any cuisine is.
    if (input === foodBox) {
      const next = foodWasPartial ? 'all' : input.checked ? 'default' : 'none';
      input.checked = next !== 'none';
      for (const box of checkboxes('cuisine')) box.checked = next === 'all' || (next === 'default' && usualFood(box));
    }
    if (input.name === 'cuisine' && foodBox) foodBox.checked = checkboxes('cuisine').some((b) => b.checked);
    if (['type', 'cuisine'].includes(input.name)) savePrefs();
    // When: a time (or "Right now", which needs none) completes the choice.
    if (input.name === 'at' || (input.name === 'night' && input.value === 'now')) {
      sheet.show(null);
      whenMenu.querySelector('summary')!.focus();
    }
    const isText = (e.target as HTMLElement).matches('input[type=search]');
    clearTimeout(timer);
    timer = window.setTimeout(() => update(true), isText ? 150 : 0);
  });
  form.addEventListener('submit', (e) => e.preventDefault());

  // "Right now" goes stale; refresh every minute.
  setInterval(() => {
    if (radios('night').value === 'now') update(false);
  }, 60_000);

  update(true);
  // Load-time marks (visible in the browser's Performance panel): list usable; the map's
  // 'map-ready' is set when it first finishes drawing.
  performance.mark('list-ready');
}
