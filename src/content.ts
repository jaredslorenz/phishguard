import { analyzeUrl } from "./analyzer";
import type { ContentToBackground, ContentToPopup, FlaggedLink, PopupToContent } from "./messages";

const ATTR = "data-phishguard";
let flagged: FlaggedLink[] = [];
let total = 0;

function injectStyles(): void {
  if (document.getElementById("phishguard-style")) return;
  const style = document.createElement("style");
  style.id = "phishguard-style";
  style.textContent = `
    a[${ATTR}="high"] { outline: 2px solid #d93025 !important; outline-offset: 2px; background: rgba(217,48,37,.12) !important; }
    a[${ATTR}="suspicious"] { outline: 2px dashed #f29900 !important; outline-offset: 2px; background: rgba(242,153,0,.12) !important; }
  `;
  document.documentElement.appendChild(style);
}

function scan(): void {
  const anchors = document.querySelectorAll<HTMLAnchorElement>("a[href]");
  const next: FlaggedLink[] = [];
  let count = 0;

  anchors.forEach((a) => {
    count++;
    const analysis = analyzeUrl(a.href, a.textContent ?? "", location.href);
    if (analysis.level === "safe") {
      a.removeAttribute(ATTR);
      return;
    }
    a.setAttribute(ATTR, analysis.level);
    a.title = `PhishGuard: ${analysis.reasons.map((r) => r.message).join("; ")}`;
    next.push({ href: a.href, text: (a.textContent ?? "").trim().slice(0, 80), analysis });
  });

  total = count;
  flagged = next.sort((x, y) => y.analysis.score - x.analysis.score);
  const msg: ContentToBackground = { type: "RESULTS", flagged: flagged.length };
  chrome.runtime.sendMessage(msg).catch(() => {});
}

let timer: number | undefined;
function scheduleScan(): void {
  window.clearTimeout(timer);
  timer = window.setTimeout(scan, 300);
}

injectStyles();
scan();
new MutationObserver(scheduleScan).observe(document.body, { childList: true, subtree: true });

chrome.runtime.onMessage.addListener((msg: PopupToContent, _sender, sendResponse) => {
  if (msg?.type === "GET_RESULTS") {
    const res: ContentToPopup = { type: "RESULTS", total, flagged };
    sendResponse(res);
  }
});
