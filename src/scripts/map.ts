import * as maplibregl from 'maplibre-gl';
import 'maplibre-gl/dist/maplibre-gl.css';
// MapLibre draws tiles in a background worker shipped as its own file; serve it with the site.
import workerUrl from 'maplibre-gl/dist/maplibre-gl-worker.mjs?url';
import { MAP_STYLE_URL, type LngLat } from '../lib/geo';
import { partialLine } from '../lib/route';

export type { LngLat };

maplibregl.setWorkerUrl(workerUrl);


export const ATL: LngLat = [-84.38, 33.76];

/**
 * Vector map drawn in the browser (smooth zoom, sharp labels). OpenFreeMap serves the
 * style and tiles for free with no key; restyle() then tunes it to the site's palette.
 */
export const STYLE_URL = MAP_STYLE_URL;

export function createMap(container: HTMLElement | string, options: Partial<maplibregl.MapOptions> = {}) {
  const map = new maplibregl.Map({
    container,
    center: ATL,
    zoom: 11,
    maxZoom: 18,
    attributionControl: { compact: true },
    // A flat, north-up map: no tilting or rotating by accident.
    dragRotate: false,
    pitchWithRotate: false,
    touchPitch: false,
    ...options,
  });
  // Restyle while loading, so the stock colors never flash on screen.
  map.setStyle(STYLE_URL, { transformStyle: (_prev, next) => restyle(next) });
  map.touchZoomRotate.disableRotation();
  map.keyboard.disableRotation();
  map.addControl(new maplibregl.NavigationControl({ showCompass: false }), 'top-left');
  // Start with the attribution folded into its (i) button rather than spread over the map.
  map.once('load', () => {
    const attrib = map.getContainer().querySelector('.maplibregl-ctrl-attrib');
    attrib?.classList.remove('maplibregl-compact-show');
    attrib?.removeAttribute('open');
  });
  return map;
}

/**
 * Site palette for OpenFreeMap's "dark" style, in the spirit of Apple's dark maps:
 * navy land, deep blue water, muted green parks, cool gray roads with brighter highways,
 * and soft, normally-capitalized labels. Keys are the style's layer ids; unknown ids are ignored.
 */
const PALETTE: Record<string, { paint?: Record<string, unknown>; layout?: Record<string, unknown> }> = {
  background: { paint: { 'background-color': '#1a1c2c' } },
  landuse_residential: { paint: { 'fill-color': '#1d1f31' } },
  landcover_wood: { paint: { 'fill-color': '#1a2a2a' } },
  landuse_park: { paint: { 'fill-color': '#1a2a2a' } },
  water: { paint: { 'fill-color': '#0f1730' } },
  waterway: { paint: { 'line-color': '#0f1730' } },
  water_name: { paint: { 'text-color': '#5f7bb0', 'text-halo-color': '#0f1730' } },
  building: { paint: { 'fill-color': '#24273b', 'fill-outline-color': '#2c2f46' } },
  'aeroway-area': { paint: { 'fill-color': '#202336' } },
  'aeroway-runway': { paint: { 'line-color': '#2e3149' } },
  'aeroway-runway-casing': { paint: { 'line-color': '#2e3149' } },
  'aeroway-taxiway': { paint: { 'line-color': '#2a2d43' } },
  road_area_pier: { paint: { 'fill-color': '#1a1c2c' } },
  road_pier: { paint: { 'line-color': '#1a1c2c' } },
  highway_path: { paint: { 'line-color': '#26293d' } },
  highway_minor: { paint: { 'line-color': '#2d3047' } },
  highway_major_casing: { paint: { 'line-color': '#1a1c2c' } },
  highway_major_inner: { paint: { 'line-color': '#3a3e5a' } },
  highway_major_subtle: { paint: { 'line-color': '#34384f' } },
  highway_motorway_casing: { paint: { 'line-color': '#1a1c2c' } },
  highway_motorway_inner: { paint: { 'line-color': '#55597a' } },
  highway_motorway_subtle: { paint: { 'line-color': '#45496a' } },
  railway: { paint: { 'line-color': '#2a2d42' } },
  railway_dashline: { paint: { 'line-color': '#1a1c2c' } },
  railway_minor: { paint: { 'line-color': '#2a2d42' } },
  railway_minor_dashline: { paint: { 'line-color': '#1a1c2c' } },
  railway_transit: { paint: { 'line-color': '#2a2d42' } },
  railway_transit_dashline: { paint: { 'line-color': '#1a1c2c' } },
  boundary_state: { paint: { 'line-color': '#3a3d58' } },
  highway_name_other: {
    paint: { 'text-color': '#8a8ca6', 'text-halo-color': '#1a1c2c', 'text-halo-width': 1.5 },
    layout: { 'text-transform': 'none', 'text-letter-spacing': 0 },
  },
  highway_name_motorway: { paint: { 'text-color': '#a3a5bd' } },
};
const PLACE_LABEL = {
  paint: { 'text-color': '#c4c5d6', 'text-halo-color': '#14162a', 'text-halo-width': 1.5 },
  layout: { 'text-transform': 'none', 'text-letter-spacing': 0 },
};

function restyle(style: maplibregl.StyleSpecification): maplibregl.StyleSpecification {
  return {
    ...style,
    layers: style.layers.map((layer) => {
      const change = layer.id.startsWith('place_') ? PLACE_LABEL : PALETTE[layer.id];
      if (!change) return layer;
      const l = layer as typeof layer & { paint?: object; layout?: object };
      return { ...l, paint: { ...l.paint, ...change.paint }, layout: { ...l.layout, ...change.layout } } as typeof layer;
    }),
  };
}

/**
 * Map dots are HTML elements, so they stay the same size while the map zooms.
 * The element is a 32px tap target; the visible dot is drawn inside it (.map-dot in CSS).
 */
export function dot(variant: 'place' | 'you', label?: string, clickable = false) {
  const el = document.createElement(clickable ? 'button' : 'div');
  el.className = `map-dot map-dot-${variant}`;
  if (el instanceof HTMLButtonElement) el.type = 'button';
  if (label) el.setAttribute('aria-label', label);
  return el;
}

/** Zoom level from which place names show beside their dots (about a neighborhood's width). */
export const LABEL_ZOOM = 13;
/** Phones show names from further out (a few neighborhoods). Collision handling keeps the
    best-ranked names that fit and drops the rest, so a wide view stays readable. */
export const PHONE_LABEL_ZOOM = 10;
const LABELS = 'place-labels';
const DOTS = 'place-dot-space';
/** Room each dot reserves so no name is drawn over it, in px (the dot is 18px). */
const DOT_SPACE_PX = 22;
const OVERLAYS = 'place-overlay-space';
/** Clearance kept between a name and what's over the map (buttons, search), in px. */
const OVERLAY_PAD_PX = 4;

export interface LabelPoint {
  /** The place's id: what a click or hover on its name reports. */
  id: string;
  name: string;
  at: LngLat;
}

/** Name highlight (hover): the accent color. */
const LABEL_HOVER_COLOR = '#ffc857';

/**
 * Place names beside the dots, once zoomed in. Drawn by MapLibre as a label
 * layer rather than as HTML, for its collision handling: each name tries the right of its
 * dot, then the left, above and below, and is left out if none is free until you zoom in
 * further. Every dot reserves an invisible square so names steer around other dots too.
 * The dots themselves stay HTML markers; a name is clickable too, and can be highlighted
 * (on hover) to match its dot.
 * Earlier points win a contested spot, so pass them in list order.
 */
export function placeLabels(
  map: maplibregl.Map,
  phone: MediaQueryList | undefined,
  on: { click: (id: string) => void; hover: (id: string | null) => void },
) {
  let points: LabelPoint[] = [];
  const minZoom = () => (phone?.matches ? PHONE_LABEL_ZOOM : LABEL_ZOOM);
  phone?.addEventListener('change', () => {
    for (const id of [LABELS, DOTS]) if (map.getLayer(id)) map.setLayerZoomRange(id, minZoom(), 24);
  });
  const data = () => ({
    type: 'FeatureCollection' as const,
    features: points.map((p, i) => ({
      type: 'Feature' as const,
      properties: { id: p.id, name: p.name, rank: i },
      geometry: { type: 'Point' as const, coordinates: p.at },
    })),
  });
  // What sits over the map: its buttons (+, −, location), the attribution, and anything
  // the page floats over it (the phone search box, marked data-map-overlay). Each is an
  // invisible box the size of the thing, pinned to wherever it is on screen: the point
  // under its center is re-found as the map moves.
  const overlayBoxes = () => {
    const host = map.getContainer();
    const h = host.getBoundingClientRect();
    const corner = (sel: string) => {
      const rs = [...host.querySelectorAll(sel)].map((el) => el.getBoundingClientRect()).filter((r) => r.width && r.height);
      return rs.length
        ? [{ left: Math.min(...rs.map((r) => r.left)), top: Math.min(...rs.map((r) => r.top)), right: Math.max(...rs.map((r) => r.right)), bottom: Math.max(...rs.map((r) => r.bottom)) }]
        : [];
    };
    const floating = [...document.querySelectorAll<HTMLElement>('[data-map-overlay]')]
      .filter((el) => el.offsetParent !== null || getComputedStyle(el).position === 'fixed')
      .map((el) => el.getBoundingClientRect());
    return [
      ...['top-left', 'top-right', 'bottom-left', 'bottom-right'].flatMap((c) => corner(`.maplibregl-ctrl-${c} > .maplibregl-ctrl`)),
      ...floating,
    ]
      .map((r) => ({
        // In the map's own pixels, clipped to it, with a little clearance.
        left: Math.max(0, r.left - h.left - OVERLAY_PAD_PX),
        top: Math.max(0, r.top - h.top - OVERLAY_PAD_PX),
        right: Math.min(h.width, r.right - h.left + OVERLAY_PAD_PX),
        bottom: Math.min(h.height, r.bottom - h.top + OVERLAY_PAD_PX),
      }))
      .filter((r) => r.right - r.left >= 1 && r.bottom - r.top >= 1)
      .map((r) => ({ x: (r.left + r.right) / 2, y: (r.top + r.bottom) / 2, w: Math.round(r.right - r.left), h: Math.round(r.bottom - r.top) }));
  };
  const overlayImages = new Map<string, string>(); // image id → its size
  const placeOverlays = () => {
    const source = map.getSource(OVERLAYS) as maplibregl.GeoJSONSource | undefined;
    if (!source) return;
    const features = overlayBoxes().map((box, i) => {
      const id = `${OVERLAYS}-${i}`;
      const size = `${box.w}x${box.h}`;
      if (overlayImages.get(id) !== size || !map.hasImage(id)) {
        overlayImages.set(id, size);
        if (map.hasImage(id)) map.removeImage(id);
        map.addImage(id, { width: box.w, height: box.h, data: new Uint8Array(box.w * box.h * 4) });
      }
      const at = map.unproject([box.x, box.y]);
      return { type: 'Feature' as const, properties: { image: id }, geometry: { type: 'Point' as const, coordinates: [at.lng, at.lat] } };
    });
    source.setData({ type: 'FeatureCollection', features });
  };
  let overlayFrame = 0;
  const schedulePlaceOverlays = () => {
    if (!overlayFrame) overlayFrame = requestAnimationFrame(() => ((overlayFrame = 0), placeOverlays()));
  };
  map.on('move', schedulePlaceOverlays);
  map.on('resize', schedulePlaceOverlays);
  phone?.addEventListener('change', schedulePlaceOverlays); // the buttons switch corners
  // The attribution opens and closes; the search box can move with the page.
  new ResizeObserver(schedulePlaceOverlays).observe(map.getContainer());
  addEventListener('scroll', schedulePlaceOverlays, { passive: true });
  map.getContainer().addEventListener('click', schedulePlaceOverlays);

  const add = () => {
    if (map.getSource(LABELS)) return;
    if (!map.hasImage('dot-space')) {
      map.addImage('dot-space', { width: DOT_SPACE_PX, height: DOT_SPACE_PX, data: new Uint8Array(DOT_SPACE_PX * DOT_SPACE_PX * 4) });
    }
    map.addSource(LABELS, { type: 'geojson', data: data(), promoteId: 'id' });
    map.addLayer({
      id: LABELS,
      type: 'symbol',
      source: LABELS,
      minzoom: minZoom(),
      layout: {
        'symbol-sort-key': ['get', 'rank'],
        'text-field': ['get', 'name'],
        'text-font': ['Noto Sans Bold'],
        'text-size': 12.5,
        'text-max-width': 14,
        'text-variable-anchor': ['left', 'right', 'top', 'bottom'],
        // Far enough out (in ems) that a name, with its padding, clears its own dot's space.
        'text-radial-offset': 1.3,
        'text-justify': 'auto',
        'text-padding': 3,
      },
      paint: {
        'text-color': ['case', ['boolean', ['feature-state', 'hover'], false], LABEL_HOVER_COLOR, '#ecebf4'],
        'text-halo-color': '#14162a',
        'text-halo-width': 1.8,
        'text-halo-blur': 0.4,
      },
    });
    // Every dot's space, in a layer above the names: MapLibre places the topmost layer
    // first, so all the dots are claimed before any name looks for room.
    map.addLayer({
      id: DOTS,
      type: 'symbol',
      source: LABELS,
      minzoom: minZoom(),
      layout: {
        'icon-image': 'dot-space',
        'icon-allow-overlap': true, // always reserve it…
        'icon-ignore-placement': false, // …so names keep off it
      },
    });
    // What's over the map, above both, so it's claimed first of all.
    overlayImages.clear();
    map.addSource(OVERLAYS, { type: 'geojson', data: { type: 'FeatureCollection', features: [] } });
    map.addLayer({
      id: OVERLAYS,
      type: 'symbol',
      source: OVERLAYS,
      layout: { 'icon-image': ['get', 'image'], 'icon-allow-overlap': true, 'icon-ignore-placement': false },
    });
    placeOverlays();
  };
  // The style arrives asynchronously (and again if it's ever swapped); add the layer each time.
  map.on('style.load', add);
  if (map.isStyleLoaded()) add();

  // A name works like its dot: click to open the place, hover to highlight both.
  const idAt = (e: maplibregl.MapLayerMouseEvent) => e.features?.[0]?.properties?.id as string | undefined;
  map.on('click', LABELS, (e) => {
    const id = idAt(e);
    if (id) on.click(id);
  });
  let hovered: string | null = null;
  map.on('mousemove', LABELS, (e) => {
    const id = idAt(e) ?? null;
    if (id === hovered) return;
    hovered = id;
    map.getCanvas().style.cursor = id ? 'pointer' : '';
    on.hover(id);
  });
  map.on('mouseleave', LABELS, () => {
    hovered = null;
    map.getCanvas().style.cursor = '';
    on.hover(null);
  });

  let lit: string | null = null;
  return {
    set(next: LabelPoint[]) {
      points = next;
      lit = null;
      (map.getSource(LABELS) as maplibregl.GeoJSONSource | undefined)?.setData(data());
      map.getContainer().dataset.labels = next.map((p) => p.name).join('|'); // for tests
    },
    /** Highlight one place's name (or none). */
    highlight(id: string | null) {
      if (!map.getSource(LABELS)) return;
      if (lit) map.setFeatureState({ source: LABELS, id: lit }, { hover: false });
      lit = id;
      if (id) map.setFeatureState({ source: LABELS, id }, { hover: true });
      map.getContainer().dataset.highlight = id ?? ''; // for tests
    },
  };
}

/** A place's dot. Clickable ones are buttons that open the marker's popup. */
export function placeMarker(at: LngLat, label?: string, clickable = true) {
  return new maplibregl.Marker({ element: dot('place', label, clickable), anchor: 'center' }).setLngLat(at);
}

/**
 * A map button (under + and −) that shows where you are. `onClick` does the work; the
 * button reflects it via `setState`: 'idle', 'busy' (locating) or 'on' (shown).
 */
export function locateControl(onClick: () => void, label = 'Show my location') {
  const group = document.createElement('div');
  group.className = 'maplibregl-ctrl maplibregl-ctrl-group';
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'map-locate';
  button.setAttribute('aria-label', label);
  button.title = label;
  button.innerHTML = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M21 3 3 10.5l7.5 3L13.5 21z" /></svg>';
  button.addEventListener('click', onClick);
  group.append(button);
  const control: maplibregl.IControl = { onAdd: () => group, onRemove: () => group.remove() };
  return {
    control,
    button,
    setState(state: 'idle' | 'busy' | 'on') {
      button.dataset.state = state;
      button.setAttribute('aria-pressed', String(state === 'on'));
      button.disabled = state === 'busy';
    },
  };
}

/** The "you are here" marker. */
export const youMarker = () => {
  const el = dot('you');
  el.title = 'You are here';
  return new maplibregl.Marker({ element: el, anchor: 'center' });
};

/** A route line on the map (blue, with a dark edge), under the dots. */
export function routeLine(map: maplibregl.Map) {
  const ID = 'route';
  let line: LngLat[] = [];
  const data = () => ({
    type: 'Feature' as const,
    properties: {},
    geometry: { type: 'LineString' as const, coordinates: line },
  });
  const add = () => {
    if (map.getSource(ID)) return;
    map.addSource(ID, { type: 'geojson', data: data() });
    const layout = { 'line-join': 'round' as const, 'line-cap': 'round' as const };
    map.addLayer({ id: `${ID}-edge`, type: 'line', source: ID, layout, paint: { 'line-color': '#0b0c18', 'line-width': 8, 'line-opacity': 0.7 } });
    map.addLayer({ id: ID, type: 'line', source: ID, layout, paint: { 'line-color': '#4ea1ff', 'line-width': 4.5 } });
  };
  map.on('style.load', add);
  if (map.isStyleLoaded()) add();
  const set = (next: LngLat[]) => {
    line = next;
    (map.getSource(ID) as maplibregl.GeoJSONSource | undefined)?.setData(data());
  };

  // Drawing: the line grows from its start (you) to its end (the place), once the map has
  // finished moving to fit it. Instant for anyone who has asked for reduced motion.
  const DRAW_MS = 1000;
  const reduceMotion = matchMedia('(prefers-reduced-motion: reduce)');
  const ease = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - (-2 * t + 2) ** 3 / 2);
  let frame = 0;
  let pending: (() => void) | null = null;
  const stop = () => {
    cancelAnimationFrame(frame);
    if (pending) map.off('moveend', pending);
    pending = null;
  };
  const draw = (full: LngLat[]) => {
    if (reduceMotion.matches) return set(full);
    const start = performance.now();
    const step = (now: number) => {
      const t = Math.min(1, (now - start) / DRAW_MS);
      set(partialLine(full, ease(t)));
      if (t < 1) frame = requestAnimationFrame(step);
    };
    frame = requestAnimationFrame(step);
  };
  return {
    show(full: LngLat[]) {
      stop();
      set([]);
      if (!map.isMoving()) return draw(full);
      pending = () => {
        pending = null;
        draw(full);
      };
      map.once('moveend', pending);
    },
    clear() {
      stop();
      set([]);
    },
  };
}

export { maplibregl };
