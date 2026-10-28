import { useEffect, useState } from "react";
import type { PopupToBackground } from "../messages";
import { STATS_KEY, toStats, topRules, type Stats } from "../stats";
import { ruleLabel } from "./rules";
import { ConfirmButton, SectionLabel } from "./ui";

function Tile({ label, value, tone = "text-ink" }: { label: string; value: number; tone?: string }) {
  return (
    <div className="rounded-lg border border-divider px-3 py-2.5">
      <div className={`text-[20px] font-bold tabular-nums ${tone}`}>{value.toLocaleString()}</div>
      <div className="text-[12px] text-muted">{label}</div>
    </div>
  );
}

export function StatsTab() {
  const [stats, setStats] = useState<Stats | null>(null);

  useEffect(() => {
    void chrome.storage.local.get(STATS_KEY).then((res) => setStats(toStats(res[STATS_KEY], Date.now())));
    const listener = (changes: Record<string, chrome.storage.StorageChange>, area: string) => {
      if (area === "local" && STATS_KEY in changes) setStats(toStats(changes[STATS_KEY]?.newValue, Date.now()));
    };
    chrome.storage.onChanged.addListener(listener);
    return () => chrome.storage.onChanged.removeListener(listener);
  }, []);

  if (!stats) return <p className="px-4 py-8 text-center text-muted">Loading…</p>;

  const rules = topRules(stats, 5);
  const max = rules[0]?.[1] ?? 1;
  const reset = () => {
    const msg: PopupToBackground = { type: "RESET_STATS" };
    void chrome.runtime.sendMessage(msg);
  };

  return (
    <div className="space-y-4 px-4 pt-3.5 pb-3">
      <div className="grid grid-cols-2 gap-2">
        <Tile label="links scanned" value={stats.linksScanned} />
        <Tile label="pages scanned" value={stats.pagesScanned} />
        <Tile label="suspicious" value={stats.suspicious} tone="text-sus-fg" />
        <Tile label="high risk" value={stats.high} tone="text-high-fg" />
      </div>

      <div>
        <SectionLabel>Top rules on flagged links</SectionLabel>
        {rules.length === 0 ? (
          <p className="mt-1.5 text-muted">Nothing flagged yet.</p>
        ) : (
          <ul className="mt-2 space-y-2">
            {rules.map(([rule, n]) => (
              <li key={rule}>
                <div className="flex justify-between gap-2 text-[12px]">
                  <span>{ruleLabel(rule)}</span>
                  <span className="text-muted tabular-nums">{n.toLocaleString()}</span>
                </div>
                <div className="mt-1 h-1.5 rounded-full bg-chip">
                  <div className="h-full rounded-full bg-brand" style={{ width: `${(n / max) * 100}%` }} />
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex items-center justify-between gap-2 border-t border-divider pt-2.5">
        <span className="text-[12px] text-muted">Since {new Date(stats.since).toLocaleDateString()}</span>
        <ConfirmButton label="Reset stats" question="Reset all counts?" confirmLabel="Reset" onConfirm={reset} />
      </div>
      <p className="text-[11px] text-muted">Counts only. PhishGuard never stores the links, link text or pages you visit.</p>
    </div>
  );
}
