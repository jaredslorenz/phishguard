import { useCallback, useEffect, useState } from "react";
import { siteOf } from "../analyzer";
import type { ContentToPopup, FlaggedLink, PopupToContent, ShowLinkResult } from "../messages";
import { addTrusted, getTrusted, onTrustedChange, removeTrusted } from "../trust";
import { BUTTON, ConfirmButton, LEVEL } from "./ui";

type Load = { status: "loading" } | { status: "error"; message: string } | { status: "done"; res: ContentToPopup; tabId: number };

/** How long to wait for the page to rescan after the trusted list changes. */
const RESCAN_WAIT_MS = 400;

async function fetchResults(): Promise<Load> {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (tab?.id === undefined) return { status: "error", message: "No active tab." };
  try {
    const msg: PopupToContent = { type: "GET_RESULTS" };
    const res: ContentToPopup | undefined = await chrome.tabs.sendMessage(tab.id, msg);
    if (!res) return { status: "error", message: "No result from the page. Try reloading it." };
    return { status: "done", res, tabId: tab.id };
  } catch {
    return { status: "error", message: "PhishGuard can't scan this page. Browser pages and the Chrome Web Store are off limits; for other pages, try reloading." };
  }
}

/** Ask the page to scroll to a flagged link and flash it. False when it's gone or hidden. */
async function showOnPage(tabId: number, id: number): Promise<boolean> {
  try {
    const msg: PopupToContent = { type: "SHOW_LINK", id };
    const res: ShowLinkResult | undefined = await chrome.tabs.sendMessage(tabId, msg);
    return res?.shown ?? false;
  } catch {
    return false;
  }
}

function LinkRow({ link, onShow }: { link: FlaggedLink; onShow: () => Promise<boolean> }) {
  const [expanded, setExpanded] = useState(false);
  const [hidden, setHidden] = useState(false);
  const { level, score, reasons, destination } = link.analysis;
  if (level === "safe") return null;
  const l = LEVEL[level];
  const [top, ...rest] = reasons;
  return (
    <li className={`rounded-lg border border-l-4 border-divider bg-white px-3 py-2.5 ${l.accent}`}>
      <div className="flex items-center gap-2">
        <span className={`rounded-full px-2 py-0.5 text-[11px] font-bold tabular-nums ${l.pill}`}>{score}</span>
        <span className={`text-[11px] font-bold tracking-[0.06em] uppercase ${level === "high" ? "text-high-fg" : "text-sus-fg"}`}>{l.label}</span>
      </div>
      <div className="mt-1.5 font-mono text-[13px] font-semibold break-all">{destination.registrable ?? destination.host}</div>
      {link.text && <div className="mt-0.5 truncate text-[12px] text-muted">Link text: “{link.text}”</div>}
      {expanded ? (
        <ul className="mt-1.5 space-y-1">
          {reasons.map((r) => (
            <li key={r.rule} className="flex items-start gap-2">
              <span className="min-w-0 flex-1">{r.message}</span>
              <span className="shrink-0 rounded-full bg-chip px-1.5 text-[11px] font-semibold text-muted tabular-nums">+{r.points}</span>
            </li>
          ))}
        </ul>
      ) : (
        top && <div className="mt-1.5">{top.message}</div>
      )}
      <div className="mt-1.5 flex items-center gap-3 text-[12px]">
        {rest.length > 0 && (
          <button
            type="button"
            className="cursor-pointer text-muted underline-offset-2 hover:text-ink hover:underline"
            aria-expanded={expanded}
            onClick={() => setExpanded(!expanded)}
          >
            {expanded ? "Show less" : `+${rest.length} more ${rest.length === 1 ? "rule" : "rules"}`}
          </button>
        )}
        <button
          type="button"
          className="ml-auto cursor-pointer font-semibold text-brand underline-offset-2 hover:underline"
          onClick={() => void onShow().then((shown) => setHidden(!shown))}
        >
          Show on page
        </button>
      </div>
      {hidden && (
        <div role="status" className="mt-1 text-[12px] text-muted">
          This link isn't visible on the page right now.
        </div>
      )}
    </li>
  );
}

export function PageTab() {
  const [load, setLoad] = useState<Load>({ status: "loading" });
  const [trusted, setTrusted] = useState<Set<string>>(new Set());

  const refresh = useCallback(() => {
    void fetchResults().then(setLoad);
  }, []);

  useEffect(() => {
    refresh();
    void getTrusted().then(setTrusted);
    let timer: ReturnType<typeof setTimeout> | undefined;
    const stop = onTrustedChange((domains) => {
      setTrusted(domains);
      clearTimeout(timer);
      timer = setTimeout(refresh, RESCAN_WAIT_MS);
    });
    return () => {
      stop();
      clearTimeout(timer);
    };
  }, [refresh]);

  if (load.status === "loading") return <p className="px-4 py-8 text-center text-muted">Scanning…</p>;
  if (load.status === "error") return <p className="m-4 rounded-lg bg-chip p-3 text-muted">{load.message}</p>;

  const { total, flagged, pageUrl } = load.res;
  const { tabId } = load;
  const high = flagged.filter((f) => f.analysis.level === "high").length;
  const suspicious = flagged.length - high;
  const pageHost = (() => {
    try {
      const u = new URL(pageUrl);
      return u.protocol === "http:" || u.protocol === "https:" ? u.hostname : null;
    } catch {
      return null;
    }
  })();
  // Same "which site is this" as the analyzer, so what the popup trusts is what the analyzer checks.
  const pageDomain = pageHost ? siteOf(pageHost) : null;

  return (
    <>
      <div className="px-4 pt-3.5 pb-3">
        <p className="text-[14px]">
          <span className="font-bold tabular-nums">{flagged.length}</span> {flagged.length === 1 ? "link" : "links"} flagged of{" "}
          <span className="tabular-nums">{total}</span> on this page
        </p>
        {flagged.length > 0 && (
          <div className="mt-2 flex gap-2">
            <span className="rounded-full bg-high-bg px-2.5 py-0.5 text-[12px] font-semibold text-high-fg">{high} high risk</span>
            <span className="rounded-full bg-sus-bg px-2.5 py-0.5 text-[12px] font-semibold text-sus-fg">{suspicious} suspicious</span>
          </div>
        )}
      </div>

      <div className="max-h-[360px] overflow-y-auto px-4 pb-3">
        {flagged.length === 0 ? (
          // Never "safe": rule-based checks can miss things.
          <p className="rounded-lg bg-chip p-3 text-muted">No warning signs found on this page.</p>
        ) : (
          <ul className="space-y-2">
            {flagged.map((f, i) => (
              <LinkRow key={`${f.id}-${i}`} link={f} onShow={() => showOnPage(tabId, f.id)} />
            ))}
          </ul>
        )}
      </div>

      {pageHost && (
        <div className="flex items-center gap-2 border-t border-divider px-4 py-2.5">
          <span className="min-w-0 flex-1 truncate font-mono text-[12px] text-muted">{pageHost}</span>
          {pageDomain &&
            (trusted.has(pageDomain) ? (
              <>
                <span className="text-[12px] font-semibold">Trusted</span>
                <button type="button" className={BUTTON.quiet} onClick={() => void removeTrusted(pageDomain)}>
                  Remove
                </button>
              </>
            ) : high > 0 ? (
              // Same rule as the card: never trust in one click when something here looks dangerous.
              <ConfirmButton
                label="Trust this site"
                buttonClass={BUTTON.secondary}
                question={`${high} high-risk ${high === 1 ? "link" : "links"} here. Trust anyway?`}
                confirmLabel="Yes, trust"
                onConfirm={() => void addTrusted(pageDomain)}
              />
            ) : (
              <button type="button" className={BUTTON.secondary} onClick={() => void addTrusted(pageDomain)}>
                Trust this site
              </button>
            ))}
        </div>
      )}
    </>
  );
}
