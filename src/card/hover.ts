import type { Analysis } from "../analyzer";
import { mountCard, type CardHandle } from "./mount";

export const OPEN_DELAY_MS = 150;
export const CLOSE_GRACE_MS = 200;

const FLAGGED = "a[data-phishguard]";

export interface HoverCard {
  isOpen(): boolean;
  /** Call after a rescan: closes the card if its link is no longer flagged. */
  refresh(): void;
}

/**
 * Shows the warning card for flagged links on hover or keyboard focus, using one delegated listener per
 * event type on the document (no per-link listeners). The card is only created on first use.
 */
export interface TrustStore {
  add(domain: string): Promise<void>;
  remove(domain: string): Promise<void>;
}

export function initHoverCard(
  lookup: (a: HTMLAnchorElement) => Analysis | undefined,
  css: string,
  trustStore?: TrustStore,
): HoverCard {
  let card: CardHandle | null = null;
  let current: HTMLAnchorElement | null = null;
  let openTimer: number | undefined;
  let closeTimer: number | undefined;
  let pointerOverCard = false;
  /**
   * True during the Undo window after trusting a domain. Trusting un-flags the link, so without this the
   * rescan, a scroll or the pointer leaving would close the card and take the Undo button with it.
   */
  let holdOpen = false;
  /** A link we just handed focus back to; its focusin must not reopen the card. */
  let returningFocusTo: HTMLAnchorElement | null = null;

  const flaggedAnchor = (t: EventTarget | null) => (t instanceof Element ? t.closest<HTMLAnchorElement>(FLAGGED) : null);

  function open(a: HTMLAnchorElement): void {
    const analysis = lookup(a);
    if (!analysis || analysis.level === "safe") return;
    card ??= mountCard({
      css,
      onMouseEnter: () => {
        pointerOverCard = true;
        window.clearTimeout(closeTimer);
      },
      onMouseLeave: () => {
        pointerOverCard = false;
        scheduleClose();
      },
      trustActions: trustStore && {
        trust(domain) {
          holdOpen = true;
          void trustStore.add(domain);
        },
        undo(domain) {
          holdOpen = false;
          void trustStore.remove(domain);
        },
        done() {
          // A keyboard user is sitting on the Undo button: hand focus back to the link, not to <body>.
          if (current && card?.hasFocus()) closeAndReturnFocus(current);
          else close(true);
        },
      },
    });
    current = a;
    holdOpen = false;
    card.show(a, analysis);
  }

  /** `force` also closes during the Undo window (Escape, or the window ending). */
  function close(force = false): void {
    if (holdOpen && !force) return;
    window.clearTimeout(openTimer);
    window.clearTimeout(closeTimer);
    holdOpen = false;
    if (!current) return;
    current = null;
    pointerOverCard = false;
    card?.hide();
  }

  function scheduleClose(): void {
    window.clearTimeout(closeTimer);
    closeTimer = window.setTimeout(() => close(), CLOSE_GRACE_MS);
  }

  document.addEventListener("mouseover", (e) => {
    const a = flaggedAnchor(e.target);
    if (!a) return;
    window.clearTimeout(closeTimer);
    if (a === current) return;
    window.clearTimeout(openTimer);
    openTimer = window.setTimeout(() => open(a), OPEN_DELAY_MS);
  });

  document.addEventListener("mouseout", (e) => {
    const a = flaggedAnchor(e.target);
    if (!a || a.contains(e.relatedTarget as Node | null)) return;
    window.clearTimeout(openTimer);
    if (a === current) scheduleClose();
  });

  // Opening on focus never moves focus: the user stays on the link until they press Tab.
  document.addEventListener("focusin", (e) => {
    if (card && e.target === card.host) return; // focus moved into the card (retargeted to its host)
    const a = flaggedAnchor(e.target);
    if (a && a === returningFocusTo) {
      returningFocusTo = null;
      return;
    }
    if (a) {
      window.clearTimeout(closeTimer);
      if (a !== current) open(a);
    } else if (current && !pointerOverCard) {
      close();
    }
  });

  document.addEventListener("focusout", (e) => {
    if (!current || e.relatedTarget !== null) return; // focusin handles moves to another element
    // Focus left the page content entirely (e.g. clicked empty space).
    if (e.target === current || (card && e.target === card.host)) {
      window.setTimeout(() => {
        if (document.activeElement !== current && !card?.hasFocus() && !pointerOverCard) close();
      }, 0);
    }
  });

  // Capture on window so a page that stops propagation can't keep the card stuck open.
  function closeAndReturnFocus(link: HTMLAnchorElement): void {
    close(true);
    returningFocusTo = link;
    link.focus();
    if (document.activeElement !== link) returningFocusTo = null;
  }

  window.addEventListener(
    "keydown",
    (e) => {
      if (!current || !card) return;
      const link = current;
      if (e.key === "Escape") {
        if (card.hasFocus()) closeAndReturnFocus(link);
        else close(true);
      } else if (e.key === "Tab" && !e.shiftKey && document.activeElement === link) {
        e.preventDefault();
        card.focusFirstButton();
      } else if (e.key === "Tab" && card.hasFocus()) {
        // The card sits at the end of the document, so leaving it by Tab would jump to the end of the page.
        // Shift+Tab off the first button goes back to the link; Tab off the last one closes the card and
        // returns to the link, so the next Tab continues through the page as normal.
        const edge = e.shiftKey ? card.focusedButtonIs("first") : card.focusedButtonIs("last");
        if (!edge) return;
        e.preventDefault();
        if (e.shiftKey) {
          returningFocusTo = link;
          link.focus();
        } else {
          closeAndReturnFocus(link);
        }
      }
    },
    true,
  );

  window.addEventListener("scroll", () => close(), { capture: true, passive: true });

  return {
    isOpen: () => current !== null,
    refresh() {
      if (current && (!current.isConnected || !current.matches(FLAGGED))) close();
    },
  };
}
