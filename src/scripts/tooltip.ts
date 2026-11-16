/**
 * Hover tooltips for elements with `data-tip`, on devices with a mouse: shown after a short
 * pause (so passing over things doesn't flash them), above the element, kept on screen.
 * One floating element, so a card's clipped edges never cut a tooltip off.
 */
const DELAY_MS = 450;

export function initTooltips() {
  if (!matchMedia('(hover: hover) and (pointer: fine)').matches) return;
  const tip = document.createElement('div');
  tip.className = 'tooltip';
  tip.setAttribute('role', 'presentation'); // what it says is already the element's label
  tip.hidden = true;
  document.body.append(tip);
  let timer = 0;
  let over: HTMLElement | null = null;

  const hide = () => {
    clearTimeout(timer);
    over = null;
    tip.hidden = true;
  };
  const show = (el: HTMLElement) => {
    tip.textContent = el.dataset.tip!;
    tip.hidden = false;
    const r = el.getBoundingClientRect();
    const t = tip.getBoundingClientRect();
    const x = Math.min(Math.max(8, r.left + r.width / 2 - t.width / 2), innerWidth - t.width - 8);
    const above = r.top - t.height - 8;
    tip.style.left = `${x}px`;
    tip.style.top = `${above >= 8 ? above : r.bottom + 8}px`;
  };

  document.addEventListener('pointerover', (e) => {
    if (e.pointerType !== 'mouse') return;
    const el = (e.target as Element).closest<HTMLElement>('[data-tip]');
    if (el === over) return;
    hide();
    if (!el) return;
    over = el;
    timer = window.setTimeout(() => over === el && show(el), DELAY_MS);
  });
  // Gone on leaving the page, scrolling, clicking or a key.
  document.addEventListener('pointerleave', hide);
  addEventListener('scroll', hide, { capture: true, passive: true });
  addEventListener('pointerdown', hide);
  addEventListener('keydown', hide);
}
