// Opening-hours logic shared by the build and the browser.
// All times are Atlanta local time (America/New_York).
//
// A "night" is a calendar day plus the early hours after it, so 2 AM Saturday
// is "Friday night at 26:00" (minute 1560). Queries use minutes relative to the
// night's midnight, which may exceed 1440.

export const DAYS = ['sun', 'mon', 'tue', 'wed', 'thu', 'fri', 'sat'] as const;
export const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
export type DayKey = (typeof DAYS)[number];
export type Hours = Partial<Record<DayKey, [string, string][]>>;

/** Late-night cutoff: before this many minutes after midnight still counts as the previous night. */
export const NIGHT_ROLLOVER = 5 * 60;

const toMin = (s: string) => {
  const [h, m] = s.split(':').map(Number);
  return h * 60 + m;
};

/** Spans for weekday `d` as [start, end] minutes from that day's midnight, end > start. */
function spansFor(hours: Hours, d: number): [number, number][] {
  return (hours[DAYS[((d % 7) + 7) % 7]] ?? []).map(([o, c]) => {
    const s = toMin(o);
    let e = toMin(c);
    if (e <= s) e += 1440;
    return [s, e];
  });
}

/** Span (relative to day `d`) containing minute `t`, following back-to-back spans (e.g. 24h places). */
export function openSpanAt(hours: Hours, d: number, t: number): [number, number] | null {
  let found: [number, number] | null = null;
  for (const off of [-1, 0, 1]) {
    for (const [s, e] of spansFor(hours, d + off)) {
      const S = s + off * 1440;
      const E = e + off * 1440;
      if (t >= S && t < E) found = [S, E];
    }
  }
  if (!found) return null;
  // Extend through spans that start exactly when this one ends.
  for (let i = 0; i < 8; i++) {
    const endDay = Math.floor(found[1] / 1440);
    const next = spansFor(hours, d + endDay).find(([s]) => s + endDay * 1440 === found![1]);
    if (!next) break;
    found = [found[0], next[1] + endDay * 1440];
  }
  return found;
}

export const isOpenAt = (hours: Hours, d: number, t: number) => openSpanAt(hours, d, t) !== null;

export function is24h(hours: Hours) {
  return DAYS.every((k) => hours[k]?.some(([o, c]) => o === '00:00' && c === '24:00'));
}

/** Latest closing minute on night `d` (relative to its midnight), or null if closed that day. */
export function latestClose(hours: Hours, d: number): number | null {
  const spans = spansFor(hours, d);
  if (!spans.length) return null;
  const last = spans.reduce((a, b) => (b[1] > a[1] ? b : a));
  return openSpanAt(hours, d, last[1] - 1)?.[1] ?? last[1];
}

export function formatTime(min: number): string {
  const m = ((min % 1440) + 1440) % 1440;
  if (m === 0) return 'midnight';
  if (m === 720) return 'noon';
  const h = Math.floor(m / 60);
  const mm = m % 60;
  const h12 = h % 12 || 12;
  return `${h12}${mm ? `:${String(mm).padStart(2, '0')}` : ''} ${h < 12 ? 'AM' : 'PM'}`;
}

/** Human description of the closing time of a span end. */
export function closesLabel(end: number, start: number): string {
  if (end - start >= 7 * 1440) return 'Open 24 hours';
  return `Open till ${formatTime(end)}`;
}

export function formatDay(hours: Hours, d: number): string {
  const spans = hours[DAYS[d]] ?? [];
  if (!spans.length) return 'Closed';
  return spans
    .map(([o, c]) => (o === '00:00' && c === '24:00' ? '24 hours' : `${formatTime(toMin(o))} – ${formatTime(toMin(c))}`))
    .join(', ');
}

/** Current Atlanta weekday (0 = Sunday) and minutes since midnight. */
export function atlantaNow(date = new Date()): { day: number; minutes: number } {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    weekday: 'short',
    hour: 'numeric',
    minute: 'numeric',
    hourCycle: 'h23',
  }).formatToParts(date);
  const get = (t: string) => parts.find((p) => p.type === t)!.value;
  const day = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(get('weekday'));
  return { day, minutes: Number(get('hour')) * 60 + Number(get('minute')) };
}

/** Which night it currently is in Atlanta (2 AM Saturday → Friday). */
export function tonight(date = new Date()): number {
  const { day, minutes } = atlantaNow(date);
  return minutes < NIGHT_ROLLOVER ? (day + 6) % 7 : day;
}
