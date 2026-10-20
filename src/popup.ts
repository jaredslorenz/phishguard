import type { ContentToPopup, PopupToContent } from "./messages";

const summary = document.getElementById("summary")!;
const list = document.getElementById("list")!;

function el<K extends keyof HTMLElementTagNameMap>(tag: K, text?: string, cls?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text; // textContent only: page-derived strings are never parsed as HTML
  if (cls) node.className = cls;
  return node;
}

async function init(): Promise<void> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) {
    summary.textContent = "No active tab.";
    return;
  }
  let res: ContentToPopup | undefined;
  try {
    const msg: PopupToContent = { type: "GET_RESULTS" };
    res = await chrome.tabs.sendMessage(tab.id, msg);
  } catch {
    summary.textContent = "Can't scan this page (browser pages and the Web Store are off limits, or reload the tab).";
    return;
  }
  if (!res) {
    summary.textContent = "No result from page. Try reloading it.";
    return;
  }

  summary.textContent = `${res.flagged.length} flagged of ${res.total} links on this page`;
  for (const f of res.flagged) {
    const item = el("div", undefined, `item ${f.analysis.level}`);
    item.append(el("span", `${f.analysis.level} · score ${f.analysis.score}`, "badge"));
    if (f.text) item.append(el("div", `"${f.text}"`));
    item.append(el("div", f.href, "url"));
    const ul = el("ul");
    for (const r of f.analysis.reasons) ul.append(el("li", r.message));
    item.append(ul);
    list.append(item);
  }
}

void init();
