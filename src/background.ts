import type { ContentToBackground, PopupToBackground } from "./messages";
import { addDelta, emptyDelta, emptyStats, isEmptyDelta, sanitizeDelta, STATS_KEY, toStats } from "./stats";

const FLUSH_MS = 1000;

// Deltas from every tab are merged here and written in one debounced, serialized step, so two tabs
// can never overwrite each other's counts.
let pending = emptyDelta();
let flushTimer: ReturnType<typeof setTimeout> | undefined;
let writing: Promise<void> = Promise.resolve();

function enqueue(write: () => Promise<void>): void {
  writing = writing.then(write).catch(() => {});
}

function flush(): void {
  flushTimer = undefined;
  if (isEmptyDelta(pending)) return;
  const delta = pending;
  pending = emptyDelta();
  enqueue(async () => {
    const stored = await chrome.storage.local.get(STATS_KEY);
    await chrome.storage.local.set({ [STATS_KEY]: addDelta(toStats(stored[STATS_KEY], Date.now()), delta) });
  });
}

chrome.runtime.onMessage.addListener((msg: ContentToBackground | PopupToBackground, sender) => {
  if (msg?.type === "RESULTS" && sender.tab?.id !== undefined) {
    const tabId = sender.tab.id;
    chrome.action.setBadgeText({ tabId, text: msg.flagged > 0 ? String(msg.flagged) : "" });
    chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
  } else if (msg?.type === "STATS_DELTA" && sender.tab) {
    pending = addDelta(pending, sanitizeDelta(msg.delta));
    flushTimer ??= setTimeout(flush, FLUSH_MS);
  } else if (msg?.type === "RESET_STATS" && !sender.tab) {
    clearTimeout(flushTimer);
    flushTimer = undefined;
    pending = emptyDelta();
    enqueue(() => chrome.storage.local.set({ [STATS_KEY]: emptyStats(Date.now()) }));
  }
});
