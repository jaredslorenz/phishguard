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
let root: Root;
let container: HTMLElement;

beforeEach(() => {
  store = {};
  sent = [];
  const links: [string, string][] = [
    ["https://paypal.com.account-check.xyz/signin", "Your account"],
    ["https://paypal-secure.com/", "PayPal support"],
  ];
  pageResults = {
    type: "RESULTS",
    total: 12,
    pageUrl: "https://news.example.com/story",
    flagged: links.map(([href, text]) => ({ href, text, analysis: analyzeUrl(href, text) })),
  };
  vi.stubGlobal("chrome", {
    tabs: { query: async () => [{ id: 1 }], sendMessage: async () => pageResults },
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

  it("This page: Trust this site saves the page's registrable domain", async () => {
    await show(PageTab);
    const btn = [...container.querySelectorAll("button")].find((b) => b.textContent === "Trust this site")!;
    await act(async () => btn.click());
    expect(store.trustedDomains).toEqual(["example.com"]);
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
