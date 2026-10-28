// @vitest-environment happy-dom
import { h, render } from "preact";
import { act } from "preact/test-utils";
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { analyzeUrl, type Analysis } from "../src/analyzer";
import { Card, UNDO_MS, type TrustActions } from "../src/card/Card";
import { CLOSE_GRACE_MS, initHoverCard, OPEN_DELAY_MS } from "../src/card/hover";
import { mountCard } from "../src/card/mount";
import { placeCard } from "../src/card/place";

const card = { width: 344, height: 300 };
const viewport = { width: 1280, height: 800 };

describe("placeCard", () => {
  it("goes below the link, left-aligned, with an 8px gap", () => {
    expect(placeCard({ top: 100, bottom: 120, left: 200 }, card, viewport)).toEqual({ top: 128, left: 200, side: "below" });
  });

  it("flips above when there is no room below", () => {
    expect(placeCard({ top: 700, bottom: 720, left: 200 }, card, viewport)).toEqual({ top: 392, left: 200, side: "above" });
  });

  it("clamps at the right edge", () => {
    expect(placeCard({ top: 100, bottom: 120, left: 1200 }, card, viewport).left).toBe(1280 - 8 - 344);
  });

  it("clamps at the left edge", () => {
    expect(placeCard({ top: 100, bottom: 120, left: -40 }, card, viewport).left).toBe(8);
  });

  it("handles a link in the bottom-right corner", () => {
    const p = placeCard({ top: 770, bottom: 790, left: 1250 }, card, viewport);
    expect(p).toEqual({ top: 462, left: 928, side: "above" });
  });

  it("stays inside the viewport when the card fits neither above nor below", () => {
    const tiny = { width: 400, height: 320 };
    const p = placeCard({ top: 150, bottom: 170, left: 10 }, card, tiny);
    expect(p.top).toBeGreaterThanOrEqual(8);
    expect(p.top + card.height).toBeLessThanOrEqual(tiny.height - 8);
    expect(p.left + card.width).toBeLessThanOrEqual(tiny.width - 8);
  });
});

const HOSTILE = "<img src=x onerror=alert(1)>";
const noop = () => {};

function renderIntoOpenShadow(analysis: Analysis): ShadowRoot {
  const host = document.createElement("div");
  document.body.append(host);
  const shadow = host.attachShadow({ mode: "open" });
  render(h(Card, { analysis, href: analysis.url, placement: { top: 0, left: 0, side: "below" }, onMouseEnter: noop, onMouseLeave: noop }), shadow);
  return shadow;
}

describe("Card content", () => {
  afterEach(() => {
    document.body.innerHTML = "";
  });

  it("renders page-controlled strings as text, never as HTML", () => {
    const real = analyzeUrl(`https://paypa1.com/${encodeURIComponent(HOSTILE)}`, HOSTILE);
    const forged: Analysis = {
      ...real,
      url: `https://paypa1.com/${HOSTILE}`,
      claimedDomain: HOSTILE,
      destination: { host: HOSTILE, registrable: HOSTILE, subdomain: HOSTILE },
      reasons: [{ rule: "x", points: 60, message: HOSTILE }],
    };
    for (const a of [real, forged]) {
      const shadow = renderIntoOpenShadow(a);
      expect(shadow.querySelector("img")).toBeNull();
    }
    expect(document.body.lastElementChild!.shadowRoot!.textContent).toContain(HOSTILE);
  });

  it("shows the verdict, score, real destination and every reason", () => {
    const a = analyzeUrl("https://paypal.com.account-check.xyz/signin", "www.paypal.com");
    const text = renderIntoOpenShadow(a).textContent!;
    expect(text).toContain("High risk");
    expect(text).toContain("100 / 100 risk");
    expect(text).toContain("Link text says");
    expect(text).toContain("account-check.xyz");
    expect(text).toContain(`Why it was flagged · ${a.reasons.length} rules`);
    expect(text).toContain(`Rules add up to ${a.rawScore}`);
    for (const r of a.reasons) expect(text).toContain(r.message);
  });

  it("is a labelled dialog", () => {
    const root = renderIntoOpenShadow(analyzeUrl("https://paypa1.com/")).querySelector("[role=dialog]");
    expect(root?.getAttribute("aria-label")).toBe("PhishGuard link warning");
  });

  it("offers no Trust button without trust actions", () => {
    const shadow = renderIntoOpenShadow(analyzeUrl("https://paypal-secure.com/"));
    expect(shadow.textContent).not.toContain("Trust");
  });
});

describe("card isolation", () => {
  it("uses a closed shadow root the page cannot reach", () => {
    const handle = mountCard({ css: "", onMouseEnter: noop, onMouseLeave: noop });
    expect(handle.host.isConnected).toBe(true);
    expect(handle.host.shadowRoot).toBeNull();
    handle.host.remove();
  });
});

describe("hover behaviour", () => {
  let link: HTMLAnchorElement;
  let analysis: Analysis;
  let hover: ReturnType<typeof initHoverCard>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<a href="https://paypa1.com/login" data-phishguard="high">Sign in</a><a href="https://example.org/">ok</a>`;
    link = document.querySelector("a")!;
    analysis = analyzeUrl(link.href);
    hover = initHoverCard((a) => (a === link ? analysis : undefined), "");
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("phishguard-card").forEach((n) => n.remove());
  });

  const over = (el: Element) => el.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
  const out = (el: Element) => el.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));

  it("mounts nothing until a flagged link is hovered", () => {
    expect(document.querySelector("phishguard-card")).toBeNull();
  });

  it("opens after the hover delay, not before", () => {
    over(link);
    vi.advanceTimersByTime(OPEN_DELAY_MS - 1);
    expect(hover.isOpen()).toBe(false);
    vi.advanceTimersByTime(1);
    expect(hover.isOpen()).toBe(true);
  });

  it("ignores links that are not flagged", () => {
    over(document.querySelectorAll("a")[1]!);
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    expect(hover.isOpen()).toBe(false);
  });

  it("closes after the grace period when the pointer leaves", () => {
    over(link);
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    out(link);
    vi.advanceTimersByTime(CLOSE_GRACE_MS - 1);
    expect(hover.isOpen()).toBe(true);
    vi.advanceTimersByTime(1);
    expect(hover.isOpen()).toBe(false);
  });

  it("closes on Escape", () => {
    over(link);
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(hover.isOpen()).toBe(false);
  });

  it("closes on scroll", () => {
    over(link);
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    window.dispatchEvent(new Event("scroll"));
    expect(hover.isOpen()).toBe(false);
  });

  it("opens on keyboard focus without moving focus", () => {
    link.focus();
    expect(hover.isOpen()).toBe(true);
    expect(document.activeElement).toBe(link);
  });

  it("closes when a rescan clears the link", () => {
    over(link);
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    link.removeAttribute("data-phishguard");
    hover.refresh();
    expect(hover.isOpen()).toBe(false);
  });
});

describe("Trust button", () => {
  let actions: { trust: Mock<TrustActions["trust"]>; undo: Mock<TrustActions["undo"]>; done: Mock<TrustActions["done"]> };

  beforeEach(() => {
    actions = { trust: vi.fn(), undo: vi.fn(), done: vi.fn() };
  });
  afterEach(() => {
    document.body.innerHTML = "";
    vi.useRealTimers();
  });

  function mount(url: string): ShadowRoot {
    const analysis = analyzeUrl(url);
    const host = document.createElement("div");
    document.body.append(host);
    const shadow = host.attachShadow({ mode: "open" });
    act(() => {
      render(
        h(Card, { analysis, href: url, placement: { top: 0, left: 0, side: "below" }, onMouseEnter: noop, onMouseLeave: noop, trustActions: actions }),
        shadow,
      );
    });
    return shadow;
  }

  const button = (root: ShadowRoot, label: string) =>
    [...root.querySelectorAll("button")].find((b) => b.textContent!.trim() === label) ?? null;

  /** A click the browser would mark as coming from the user; act() flushes Preact's async re-render. */
  function userClick(el: Element): void {
    const ev = new MouseEvent("click", { bubbles: true });
    Object.defineProperty(ev, "isTrusted", { value: true });
    act(() => {
      el.dispatchEvent(ev);
    });
  }

  it("suspicious: one click trusts the domain and offers Undo", () => {
    const root = mount("https://paypal-secure.com/");
    userClick(button(root, "Trust paypal-secure.com")!);
    expect(actions.trust).toHaveBeenCalledWith("paypal-secure.com");
    expect(root.textContent).toContain("Trusted paypal-secure.com");
    userClick(button(root, "Undo")!);
    expect(actions.undo).toHaveBeenCalledWith("paypal-secure.com");
    expect(button(root, "Trust paypal-secure.com")).not.toBeNull();
  });

  it("the Undo window ends after 5 seconds", () => {
    vi.useFakeTimers();
    const root = mount("https://paypal-secure.com/");
    userClick(button(root, "Trust paypal-secure.com")!);
    vi.advanceTimersByTime(UNDO_MS - 1);
    expect(actions.done).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1);
    expect(actions.done).toHaveBeenCalledOnce();
  });

  it("high risk: the first click only asks for confirmation", () => {
    const root = mount("https://paypa1.com/login");
    expect(button(root, "Trust paypa1.com")).toBeNull();
    userClick(button(root, "Trust anyway…")!);
    expect(actions.trust).not.toHaveBeenCalled();
    expect(root.textContent).toContain("Trust paypa1.com? It looks like a phishing link.");

    userClick(button(root, "Cancel")!);
    expect(actions.trust).not.toHaveBeenCalled();
    expect(button(root, "Trust anyway…")).not.toBeNull();

    userClick(button(root, "Trust anyway…")!);
    userClick(button(root, "Yes, trust")!);
    expect(actions.trust).toHaveBeenCalledWith("paypa1.com");
  });

  it("ignores clicks a page script fakes", () => {
    const root = mount("https://paypal-secure.com/");
    act(() => button(root, "Trust paypal-secure.com")!.click());
    expect(actions.trust).not.toHaveBeenCalled();
  });

  it("never offers Trust for a raw IP address", () => {
    const root = mount("http://203.0.113.5/login");
    expect(root.textContent).not.toContain("Trust");
  });
});

