import type { ContentToBackground } from "./messages";

chrome.runtime.onMessage.addListener((msg: ContentToBackground, sender) => {
  if (msg?.type !== "RESULTS" || sender.tab?.id === undefined) return;
  const tabId = sender.tab.id;
  chrome.action.setBadgeText({ tabId, text: msg.flagged > 0 ? String(msg.flagged) : "" });
  chrome.action.setBadgeBackgroundColor({ tabId, color: "#d93025" });
});
