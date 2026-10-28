// @vitest-environment happy-dom
import { act, createElement, type FunctionComponent } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { analyzeUrl } from "../src/analyzer";
import type { ContentToPopup } from "../src/messages";
import { PageTab } from "../src/popup/PageTab";
import { StatsTab } from "../src/popup/StatsTab";
import { TrustedSites } from "../src/popup/TrustedSites";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let store: Record<string, unknown>;
let pageResults: ContentToPopup;
let sent: unknown[];
let toPage: unknown[];
let linkShown: boolean;
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  store = {};
  sent = [];
  toPage = [];
  linkShown = true;
  const links: [string, string][] = [
    ["https://paypal.com.account-check.xyz/signin", "Your account"],
    ["https://paypal-secure.com/", "PayPal support"],
  ];
  pageResults = {
    type: "RESULTS",
    total: 12,
    pageUrl: "https://news.example.com/story",
    flagged: links.map(([href, text], i) => ({ id: i + 1, href, text, analysis: analyzeUrl(href, text) })),
  };
  vi.stubGlobal("chrome", {
    tabs: {
      query: async () => [{ id: 1 }],
      sendMessage: async (_tabId: number, m: { type: string }) => {
        toPage.push(m);
        return m.type === "SHOW_LINK" ? { type: "SHOWN", shown: linkShown } : pageResults;
      },
    },
    runtime: { sendMessage: async (m: unknown) => void sent.push(m) },
    storage: {
      local: {
        get: async (key: string) => ({ [key]: store[key] }),
        set: async (items: Record<string, unknown>) => void Object.assign(store, items),
      },
      onChanged: { addListener: () => {}, removeListener: () => {} },
    },
  });
  container = document.createElement("div");
  document.body.append(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

async function show(component: FunctionComponent): Promise<string> {
  await act(async () => root.render(createElement(component)));
  return container.textContent ?? "";
}

describe("popup", () => {
  it("This page: summary, chips, rows and the site footer", async () => {
    const text = await show(PageTab);
    expect(text).toContain("2 links flagged of 12 on this page");
    expect(text).toContain("1 high risk");
    expect(text).toContain("1 suspicious");
    expect(text).toContain("account-check.xyz");
    expect(text).toContain("Link text: “Your account”");
    expect(text).toMatch(/\+\d more rules?/);
    expect(text).toContain("news.example.com");
    expect(text).toContain("Trust this site");
  });

  it("This page: never calls a page safe", async () => {
    pageResults = { ...pageResults, flagged: [] };
    const text = await show(PageTab);
    expect(text).toContain("No warning signs found on this page.");
    expect(text.toLowerCase()).not.toMatch(/\bsafe\b/);
  });

  const button = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label);

  it("This page: Trust this site saves the page's site in one click when nothing is high risk", async () => {
    pageResults = { ...pageResults, flagged: pageResults.flagged.filter((f) => f.analysis.level !== "high") };
    await show(PageTab);
    await act(async () => button("Trust this site")!.click());
    expect(store.trustedDomains).toEqual(["example.com"]);
  });

  it("This page: Trust this site needs a second click when the page has high-risk links", async () => {
    const text = await show(PageTab);
    expect(text).toContain("1 high risk");
    await act(async () => button("Trust this site")!.click());
    expect(store.trustedDomains).toBeUndefined();
    expect(container.textContent).toContain("1 high-risk link here. Trust anyway?");
    await act(async () => button("Cancel")!.click());
    expect(store.trustedDomains).toBeUndefined();
    await act(async () => button("Trust this site")!.click());
    await act(async () => button("Yes, trust")!.click());
    expect(store.trustedDomains).toEqual(["example.com"]);
  });

  it("This page: trusting a hosted site saves that site, not the whole platform", async () => {
    pageResults = { ...pageResults, flagged: [], pageUrl: "https://someone.github.io/blog" };
    await show(PageTab);
    await act(async () => button("Trust this site")!.click());
    expect(store.trustedDomains).toEqual(["someone.github.io"]);
  });

  it("This page: +N more rules expands to every rule with its points", async () => {
    await show(PageTab);
    const row = container.querySelector("li")!;
    const reasons = pageResults.flagged[0]!.analysis.reasons;
    expect(reasons.length).toBeGreaterThan(1);
    expect(row.textContent).not.toContain(reasons[1]!.message);

    const more = [...row.querySelectorAll("button")].find((b) => /more rules?/.test(b.textContent ?? ""))!;
    expect(more.getAttribute("aria-expanded")).toBe("false");
    await act(async () => more.click());
    for (const r of reasons) {
      expect(row.textContent).toContain(r.message);
      expect(row.textContent).toContain(`+${r.points}`);
    }
    expect(more.textContent).toBe("Show less");
    expect(more.getAttribute("aria-expanded")).toBe("true");
  });

  it("This page: Show on page asks the page to reveal that link", async () => {
    await show(PageTab);
    const showButtons = [...container.querySelectorAll("button")].filter((b) => b.textContent === "Show on page");
    expect(showButtons).toHaveLength(2);
    await act(async () => showButtons[1]!.click());
    expect(toPage.at(-1)).toEqual({ type: "SHOW_LINK", id: pageResults.flagged[1]!.id });
    expect(container.textContent).not.toContain("isn't visible");
  });

  it("This page: Show on page says so when the link is hidden", async () => {
    linkShown = false;
    await show(PageTab);
    await act(async () => button("Show on page")!.click());
    expect(container.textContent).toContain("This link isn't visible on the page right now.");
  });

  it("Stats: tiles, top rules and a two-step reset", async () => {
    store.stats = { since: Date.UTC(2026, 9, 1), linksScanned: 1234, pagesScanned: 56, suspicious: 7, high: 3, ruleCounts: { lookalike: 4, "ip-host": 2 } };
    const text = await show(StatsTab);
    expect(text).toContain("1,234");
    expect(text).toContain("Lookalike characters");
    expect(text).toContain("Raw IP address");
    expect(text).toContain("never stores the links");

    const find = (label: string) => [...container.querySelectorAll("button")].find((b) => b.textContent === label)!;
    await act(async () => find("Reset stats").click());
    expect(sent).toEqual([]);
    await act(async () => find("Reset").click());
    expect(sent).toEqual([{ type: "RESET_STATS" }]);
  });

  it("Trusted sites: lists domains and removes one", async () => {
    store.trustedDomains = ["example.com", "instructure.com"];
    const text = await show(TrustedSites);
    expect(text).toContain("example.com");
    expect(text).toContain("instructure.com");
    await act(async () => container.querySelector<HTMLButtonElement>('[aria-label="Remove example.com"]')!.click());
    expect(store.trustedDomains).toEqual(["instructure.com"]);
  });

  it("Trusted sites: empty state", async () => {
    expect(await show(TrustedSites)).toContain("No trusted sites yet");
  });
});
