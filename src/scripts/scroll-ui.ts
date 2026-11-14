/**
 * A fading scrollbar and edge fades for a scrolling box. Ported from tada's
 * useFadingScrollbar + syncScrollFades, without React.
 *
 * Scrollbar: the native bar is hidden in CSS (`scrollbar-width: none`) and replaced by
 * a plain div that appears while you scroll and fades out after. A real element,
 * because `::-webkit-scrollbar` can't be transitioned and Firefox has no opacity for it.
 * The thumb is mounted beside the scroller, on its non-scrolling parent, so it never
 * gets carried off by the content and chased back each frame; only its travel along
 * the track (a translateY) changes per scroll.
 *
 * Fades: the container gets `.scrolled-top` while content is hidden above and
 * `.scrollable-bottom` while content remains below; CSS paints a fade at each such edge.
 * Gated, because a fade over the last item when there's nothing more reads as a stripe.
 */

/** How long after the last scroll event the bar fades out. */
const IDLE_MS = 900;
/** Shortest thumb, in px; below this it reads as a speck. */
const MIN_THUMB_PX = 24;
/** Gap between the thumb and the scroller's right edge, in px. */
const THUMB_INSET_PX = 3;
/** Slack for sub-pixel scroll positions at either end, in px. */
const SLACK = 2;

/** Thumb position and size along the track, or null when nothing overflows. */
export function thumbGeometry(scrollTop: number, scrollHeight: number, clientHeight: number, insetStart = 0, insetEnd = 0) {
  const overflow = scrollHeight - clientHeight;
  if (overflow <= 1) return null;
  const track = clientHeight - insetStart - insetEnd;
  if (track <= 0) return null;
  const height = Math.min(track, Math.max(MIN_THUMB_PX, track * (clientHeight / scrollHeight)));
  // A floored thumb shortens its own travel; scale by what's left so it never overhangs.
  const travel = track - height;
  return { top: insetStart + Math.min(travel, Math.max(0, travel * (scrollTop / overflow))), height };
}

/** How far a rounded corner of `radius` reaches along the edge at `distance` px in from the side. */
function cornerClearance(radius: number, distance: number) {
  if (radius <= 0 || distance >= radius) return 0;
  return radius - Math.sqrt(radius * radius - (radius - distance) ** 2);
}

/**
 * Attach the thumb and fades to `scroller`. Its parent must be the positioned box
 * (it carries the fade classes and hosts the thumb). Returns `refresh`, to call when
 * the content changes without a scroll (filtering, re-sorting).
 */
export function attachScrollUi(scroller: HTMLElement) {
  const host = scroller.parentElement!;
  const thumb = document.createElement('div');
  thumb.className = 'scrollthumb';
  thumb.setAttribute('aria-hidden', 'true');
  host.insertBefore(thumb, scroller.nextSibling);

  let frame = 0;
  let idle = 0;

  const syncFades = () => {
    host.classList.toggle('scrolled-top', scroller.scrollTop > SLACK);
    host.classList.toggle('scrollable-bottom', scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop > SLACK);
  };

  const measure = () => {
    frame = 0;
    syncFades();
    const { scrollTop, scrollHeight, clientHeight } = scroller;
    if (!scroller.offsetParent) {
      thumb.style.display = 'none';
      return;
    }
    // The thumb shares the scroller's offsetParent (the host), so the scroller's offsets
    // are already in the thumb's coordinates.
    const top = scroller.offsetTop + scroller.clientTop;
    const right = host.clientWidth - (scroller.offsetLeft + scroller.clientLeft + scroller.clientWidth) + THUMB_INSET_PX;
    // Keep the track clear of the host's rounded right corners.
    const cs = getComputedStyle(host);
    const inner = (r: string) => Math.max(0, (parseFloat(r) || 0) - (parseFloat(cs.borderRightWidth) || 0));
    const need = (r: string) => {
      const reach = cornerClearance(inner(r), right);
      return reach > 0 ? reach + THUMB_INSET_PX : 0;
    };
    const gapBelow = host.clientHeight - (top + clientHeight);
    const geo = thumbGeometry(
      scrollTop,
      scrollHeight,
      clientHeight,
      Math.max(0, need(cs.borderTopRightRadius) - top),
      Math.max(0, need(cs.borderBottomRightRadius) - gapBelow),
    );
    if (!geo) {
      thumb.style.display = 'none';
      return;
    }
    thumb.style.display = '';
    thumb.style.top = `${top}px`;
    thumb.style.right = `${right}px`;
    thumb.style.height = `${geo.height}px`;
    thumb.style.transform = `translateY(${geo.top}px)`;
  };

  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(measure);
  };

  scroller.addEventListener(
    'scroll',
    () => {
      schedule();
      thumb.classList.add('is-visible');
      clearTimeout(idle);
      idle = window.setTimeout(() => thumb.classList.remove('is-visible'), IDLE_MS);
    },
    { passive: true },
  );
  // A resize isn't the user scrolling: update quietly, without flashing the thumb.
  const ro = new ResizeObserver(schedule);
  ro.observe(scroller);
  ro.observe(host);
  measure();

  return schedule;
}
