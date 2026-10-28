import cardCss from "../build/card.css";
import { analyzeUrl, type Analysis } from "./analyzer";
import { initHoverCard } from "./card/hover";
import type { ContentToBackground, ContentToPopup, FlaggedLink, PopupToContent, ShowLinkResult } from "./messages";
import { FLASH_ATTR, FLASH_MS, revealLink } from "./reveal";
import { createScanScheduler } from "./scheduler";
import { emptyDelta, isEmptyDelta } from "./stats";
import { addTrusted, getTrusted, onTrustedChange, removeTrusted } from "./trust";

const ATTR = "data-phishguard";
let flagged: FlaggedLink[] = [];
let total = 0;
let results = new WeakMap<HTMLAnchorElement, Analysis>();
/** Ids for the popup's "Show on page". An element keeps its id across rescans. */
const ids = new WeakMap<HTMLAnchorElement, number>();
let nextId = 1;
let flaggedById = new Map<number, HTMLAnchorElement>();
let trusted: ReadonlySet<string> = new Set();
/** Links already counted in stats this page load, so rescans don't count them twice. */
const counted = new WeakSet<HTMLAnchorElement>();
let pageCounted = false;

function injectStyles(): void {
  if (document.getElementById("phishguard-style")) return;
  const style = document.createElement("style");
  style.id = "phishguard-style";
  style.textContent = `
    a[${ATTR}="high"] { outline: 2px solid #d93025 !important; outline-offset: 2px; background: rgba(217,48,37,.12) !important; }
    a[${ATTR}="suspicious"] { outline: 2px dashed #f29900 !important; outline-offset: 2px; background: rgba(242,153,0,.12) !important; }
    @keyframes phishguard-flash { 0%, 100% { box-shadow: 0 0 0 0 rgba(59,91,219,0); } 50% { box-shadow: 0 0 0 6px rgba(59,91,219,.6); } }
    a[${FLASH_ATTR}] { animation: phishguard-flash ${FLASH_MS / 4}ms ease-in-out 4 !important; }
    @media (prefers-reduced-motion: reduce) { a[${FLASH_ATTR}] { animation: none !important; box-shadow: 0 0 0 4px rgba(59,91,219,.6) !important; } }
  `;
  document.documentElement.appendChild(style);
}

/** Rescan 300 ms after the page settles, and at least once a second on pages that never settle. */
const scheduler = createScanScheduler(() => scan(), 300, 1000);
const observer = new MutationObserver(() => scheduler.schedule());

/**
 * Reloading or updating the extension leaves this script running in tabs that were already open, but cut
 * off from the extension: every chrome.* call then throws "Extension context invalidated". When that
 * happens, stop watching the page and go quiet. Outlines already drawn stay until the tab is reloaded.
 */
function extensionAlive(): boolean {
  if (chrome.runtime?.id) return true;
  shutDown();
  return false;
}

function shutDown(): void {
  observer.disconnect();
  scheduler.cancel();
}

/** sendMessage throws synchronously (not a rejected promise) once the context is gone. */
function send(msg: ContentToBackground): void {
  if (!extensionAlive()) return;
  try {
    chrome.runtime.sendMessage(msg).catch(() => {});
  } catch {
    shutDown();
  }
}

function scan(): void {
  if (!extensionAlive()) return;
  const anchors = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  const next: FlaggedLink[] = [];
  const nextResults = new WeakMap<HTMLAnchorElement, Analysis>();
  const nextById = new Map<number, HTMLAnchorElement>();
  const delta = emptyDelta();
  let count = 0;

  anchors.forEach((a) => {
    count++;
    const analysis = analyzeUrl(a.href, a.textContent ?? "", location.href, { trusted });
    if (!counted.has(a)) {
      counted.add(a);
      delta.linksScanned++;
      if (analysis.level !== "safe") {
        delta[analysis.level]++;
        for (const r of analysis.reasons) delta.ruleCounts[r.rule] = (delta.ruleCounts[r.rule] ?? 0) + 1;
      }
    }
    if (analysis.level === "safe") {
      a.removeAttribute(ATTR);
      return;
    }
    a.setAttribute(ATTR, analysis.level);
    nextResults.set(a, analysis);
    let id = ids.get(a);
    if (id === undefined) ids.set(a, (id = nextId++));
    nextById.set(id, a);
    next.push({ id, href: a.href, text: (a.textContent ?? "").trim().slice(0, 80), analysis });
  });

  total = count;
  results = nextResults;
  flaggedById = nextById;
  hoverCard.refresh();
  flagged = next.sort((x, y) => y.analysis.score - x.analysis.score);
  send({ type: "RESULTS", flagged: flagged.length });

  if (!pageCounted) {
    pageCounted = true;
    delta.pagesScanned = 1;
  }
  if (!isEmptyDelta(delta)) send({ type: "STATS_DELTA", delta });
}

// The card's Trust/Undo buttons write to storage, which also throws once the extension is reloaded.
const hoverCard = initHoverCard((a) => results.get(a), cardCss, {
  add: (domain) => (extensionAlive() ? addTrusted(domain).catch(() => {}) : Promise.resolve()),
  remove: (domain) => (extensionAlive() ? removeTrusted(domain).catch(() => {}) : Promise.resolve()),
});

injectStyles();
// Load the trusted list before the first scan so trusted links never flash an outline; rescan when it changes.
void getTrusted()
  .catch(() => new Set<string>())
  .then((domains) => {
    trusted = domains;
    scan();
  });
onTrustedChange((domains) => {
  trusted = domains;
  scan();
});
observer.observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg: PopupToContent, _sender, sendResponse) => {
  if (msg?.type === "GET_RESULTS") {
    const res: ContentToPopup = { type: "RESULTS", total, flagged, pageUrl: location.href };
    sendResponse(res);
  } else if (msg?.type === "SHOW_LINK") {
    const res: ShowLinkResult = { type: "SHOWN", shown: revealLink(flaggedById.get(msg.id)) };
    sendResponse(res);
  }
});
