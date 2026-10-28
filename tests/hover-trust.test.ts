// @vitest-environment happy-dom
import { afterEach, beforeEach, describe, expect, it, vi, type Mock } from "vitest";
import { analyzeUrl } from "../src/analyzer";
import type { TrustActions } from "../src/card/Card";
import type { TrustStore } from "../src/card/hover";

// The real card lives in a closed shadow root, so capture the trust actions the controller hands to it.
let actions: TrustActions | undefined;
vi.mock("../src/card/mount", () => ({
  mountCard: (opts: { trustActions?: TrustActions }) => {
    actions = opts.trustActions;
    const host = document.createElement("phishguard-card");
    document.documentElement.append(host);
    return { host, show: vi.fn(), hide: vi.fn(), focusFirstButton: vi.fn(), hasFocus: () => false, focusedButtonIs: () => false };
  },
}));

const { initHoverCard, OPEN_DELAY_MS, CLOSE_GRACE_MS } = await import("../src/card/hover");

describe("hover card during the Undo window", () => {
  let link: HTMLAnchorElement;
  let store: { add: Mock<TrustStore["add"]>; remove: Mock<TrustStore["remove"]> };
  let hover: ReturnType<typeof initHoverCard>;

  beforeEach(() => {
    vi.useFakeTimers();
    document.body.innerHTML = `<a href="https://paypal-secure.com/" data-phishguard="suspicious">x</a>`;
    link = document.querySelector("a")!;
    const analysis = analyzeUrl(link.href);
    store = { add: vi.fn<TrustStore["add"]>(async () => {}), remove: vi.fn<TrustStore["remove"]>(async () => {}) };
    hover = initHoverCard((a) => (a === link ? analysis : undefined), "", store);
    link.dispatchEvent(new MouseEvent("mouseover", { bubbles: true }));
    vi.advanceTimersByTime(OPEN_DELAY_MS);
    expect(hover.isOpen()).toBe(true);
  });

  afterEach(() => {
    vi.useRealTimers();
    document.querySelectorAll("phishguard-card").forEach((n) => n.remove());
  });

  it("saves the domain and stays open when the rescan un-flags the link", () => {
    actions!.trust("paypal-secure.com");
    expect(store.add).toHaveBeenCalledWith("paypal-secure.com");
    link.removeAttribute("data-phishguard");
    hover.refresh();
    expect(hover.isOpen()).toBe(true);
  });

  it("ignores pointer-leave and scroll while Undo is showing", () => {
    actions!.trust("paypal-secure.com");
    link.dispatchEvent(new MouseEvent("mouseout", { bubbles: true, relatedTarget: document.body }));
    vi.advanceTimersByTime(CLOSE_GRACE_MS);
    window.dispatchEvent(new Event("scroll"));
    expect(hover.isOpen()).toBe(true);
  });

  it("Escape still closes it", () => {
    actions!.trust("paypal-secure.com");
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    expect(hover.isOpen()).toBe(false);
  });

  it("closes when the Undo window ends", () => {
    actions!.trust("paypal-secure.com");
    actions!.done();
    expect(hover.isOpen()).toBe(false);
  });

  it("Undo removes the domain and the card behaves normally again", () => {
    actions!.trust("paypal-secure.com");
    actions!.undo("paypal-secure.com");
    expect(store.remove).toHaveBeenCalledWith("paypal-secure.com");
    window.dispatchEvent(new Event("scroll"));
    expect(hover.isOpen()).toBe(false);
  });
});
