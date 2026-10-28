import { useState, type ReactNode } from "react";
import type { Level } from "../analyzer";

const BASE =
  "cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-default disabled:opacity-60";

export const BUTTON = {
  secondary: `${BASE} border border-line bg-white text-ink hover:bg-chip focus-visible:outline-brand`,
  danger: `${BASE} bg-high-bar text-white hover:bg-high-fg focus-visible:outline-high-fg`,
  quiet: `${BASE} font-normal text-muted hover:text-ink focus-visible:outline-muted`,
};

export const LEVEL = {
  suspicious: { label: "Suspicious", pill: "bg-sus-bg text-sus-fg", accent: "border-l-sus-bar" },
  high: { label: "High risk", pill: "bg-high-bg text-high-fg", accent: "border-l-high-bar" },
} satisfies Record<Exclude<Level, "safe">, unknown>;

export function SectionLabel({ children }: { children: ReactNode }) {
  return <div className="text-[11px] font-semibold tracking-[0.06em] text-muted uppercase">{children}</div>;
}

/** A destructive action that needs a second click: "Clear all" → "Clear all trusted sites? Cancel / Clear". */
export function ConfirmButton({ label, question, confirmLabel, onConfirm }: { label: string; question: string; confirmLabel: string; onConfirm: () => void }) {
  const [asking, setAsking] = useState(false);
  if (!asking) {
    return (
      <button type="button" className={BUTTON.quiet} onClick={() => setAsking(true)}>
        {label}
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <span className="text-[12px]">{question}</span>
      <button type="button" className={BUTTON.secondary} onClick={() => setAsking(false)} autoFocus>
        Cancel
      </button>
      <button
        type="button"
        className={BUTTON.danger}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        {confirmLabel}
      </button>
    </div>
  );
}
