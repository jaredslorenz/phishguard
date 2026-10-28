/** @jsxImportSource preact */
import { render } from "preact";
import type { Analysis } from "../analyzer";
import { Card, type TrustActions } from "./Card";
import { placeCard } from "./place";

export interface CardHandle {
  /** The element the page sees. Its shadow root is closed, so page scripts get null from host.shadowRoot. */
  host: HTMLElement;
  show(anchor: HTMLAnchorElement, analysis: Analysis): void;
  hide(): void;
  focusFirstButton(): void;
  /** True when keyboard focus is inside the card. */
  hasFocus(): boolean;
  focusedButtonIs(which: "first" | "last"): boolean;
}

interface MountOptions {
  css: string;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  trustActions?: TrustActions;
}

// !important inline styles beat anything the page's stylesheets say about our element.
const HOST_STYLE =
  "all:initial!important;position:fixed!important;top:0!important;left:0!important;width:0!important;height:0!important;z-index:2147483647!important;";

export function mountCard({ css, onMouseEnter, onMouseLeave, trustActions }: MountOptions): CardHandle {
  const host = document.createElement("phishguard-card");
  host.setAttribute("style", HOST_STYLE);
  const shadow = host.attachShadow({ mode: "closed" });
  const style = document.createElement("style");
  style.textContent = css;
  const container = document.createElement("div");
  shadow.append(style, container);
  document.documentElement.appendChild(host);

  const draw = (anchor: HTMLAnchorElement, analysis: Analysis, anchorRect: DOMRect | null) =>
    render(
      <Card
        // Keyed by link so per-link state (the "Copied" label) resets when the card moves to another link.
        key={anchor.href}
        analysis={analysis}
        href={anchor.href}
        placement={anchorRect ? placeCard(anchorRect, measure(), viewport()) : null}
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        trustActions={trustActions}
      />,
      container,
    );

  const measure = () => {
    const el = container.firstElementChild as HTMLElement | null;
    const r = el?.getBoundingClientRect();
    return { width: r?.width ?? 344, height: r?.height ?? 0 };
  };
  const viewport = () => ({ width: document.documentElement.clientWidth, height: document.documentElement.clientHeight });

  return {
    host,
    show(anchor, analysis) {
      // Render hidden to measure, then render again at the computed position.
      draw(anchor, analysis, null);
      draw(anchor, analysis, anchor.getBoundingClientRect());
    },
    hide() {
      render(null, container);
    },
    focusFirstButton() {
      shadow.querySelector<HTMLButtonElement>("button")?.focus();
    },
    hasFocus() {
      return shadow.activeElement !== null;
    },
    focusedButtonIs(which) {
      const buttons = shadow.querySelectorAll<HTMLButtonElement>("button");
      const edge = which === "first" ? buttons[0] : buttons[buttons.length - 1];
      return edge !== undefined && shadow.activeElement === edge;
    },
  };
}
