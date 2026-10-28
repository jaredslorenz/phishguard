export const FLASH_ATTR = "data-phishguard-flash";
export const FLASH_MS = 2000;

const timers = new WeakMap<Element, ReturnType<typeof setTimeout>>();

/** False for links that are detached or not rendered (display:none, a closed menu, a hidden slide). */
export function isVisible(el: Element): boolean {
  if (!el.isConnected) return false;
  // checkVisibility also catches visibility:hidden and content-visibility; fall back where it's missing.
  if (typeof el.checkVisibility === "function" && !el.checkVisibility({ visibilityProperty: true })) return false;
  return el.getClientRects().length > 0;
}

/**
 * Scroll a flagged link to the middle of the screen and flash a highlight around it. Never clicks or
 * focuses it: a focused link follows itself on Enter, and the point is to look, not to visit.
 */
export function revealLink(el: Element | undefined): boolean {
  if (!el || !isVisible(el)) return false;
  const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
  el.scrollIntoView({ block: "center", inline: "nearest", behavior: reduceMotion ? "auto" : "smooth" });

  // Restart the flash if it's already running, so a second click flashes again.
  clearTimeout(timers.get(el));
  el.removeAttribute(FLASH_ATTR);
  void (el as HTMLElement).offsetWidth;
  el.setAttribute(FLASH_ATTR, "");
  timers.set(
    el,
    setTimeout(() => {
      el.removeAttribute(FLASH_ATTR);
      timers.delete(el);
    }, FLASH_MS),
  );
  return true;
}
