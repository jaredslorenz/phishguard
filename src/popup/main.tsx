import { useState } from "react";
import { createRoot } from "react-dom/client";
import { PageTab } from "./PageTab";
import { StatsTab } from "./StatsTab";
import { TrustedSites } from "./TrustedSites";

type View = "page" | "stats" | "trusted";

function ShieldIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2.2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9 12 2 2 4-4" />
    </svg>
  );
}

function GearIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-[18px]" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="12" r="3" />
      <path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z" />
    </svg>
  );
}

function Tab({ active, onClick, children }: { active: boolean; onClick: () => void; children: string }) {
  return (
    <button
      type="button"
      role="tab"
      aria-selected={active}
      onClick={onClick}
      className={`-mb-px cursor-pointer border-b-2 px-1 pb-2 text-[13px] font-semibold focus-visible:outline-2 focus-visible:outline-brand ${
        active ? "border-brand text-ink" : "border-transparent text-muted hover:text-ink"
      }`}
    >
      {children}
    </button>
  );
}

function App() {
  const [view, setView] = useState<View>("page");
  const showingTrusted = view === "trusted";

  return (
    <div className="flex flex-col">
      <header className="border-b border-divider px-4 pt-3">
        <div className="flex items-center gap-2">
          <div className="grid size-7 place-items-center rounded-lg bg-brand text-white">
            <ShieldIcon />
          </div>
          <h1 className="flex-1 text-[15px] font-bold">PhishGuard</h1>
          <button
            type="button"
            onClick={() => setView(showingTrusted ? "page" : "trusted")}
            aria-label="Trusted sites"
            aria-pressed={showingTrusted}
            className={`grid size-8 cursor-pointer place-items-center rounded-lg focus-visible:outline-2 focus-visible:outline-brand ${
              showingTrusted ? "bg-chip text-ink" : "text-muted hover:bg-chip hover:text-ink"
            }`}
          >
            <GearIcon />
          </button>
        </div>
        <nav role="tablist" className="mt-2 flex gap-4">
          <Tab active={view === "page"} onClick={() => setView("page")}>
            This page
          </Tab>
          <Tab active={view === "stats"} onClick={() => setView("stats")}>
            Stats
          </Tab>
        </nav>
      </header>

      <main>
        {view === "page" && <PageTab />}
        {view === "stats" && <StatsTab />}
        {view === "trusted" && <TrustedSites />}
      </main>

      <footer className="border-t border-divider px-4 py-2 text-[11px] text-muted">
        Rule-based checks, nothing leaves your browser. No warning doesn't guarantee a link is safe.
      </footer>
    </div>
  );
}

createRoot(document.getElementById("root")!).render(<App />);
