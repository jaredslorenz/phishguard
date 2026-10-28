/** @jsxImportSource preact */
import { useEffect, useLayoutEffect, useRef, useState } from "preact/hooks";
import { HIGH_THRESHOLD, SUSPICIOUS_THRESHOLD, type Analysis } from "../analyzer";
import type { Placement } from "./place";

export interface CardProps {
  analysis: Analysis;
  /** The link's own href, copied on "Copy link". */
  href: string;
  /** null while the card is being measured. */
  placement: Placement | null;
  onMouseEnter: () => void;
  onMouseLeave: () => void;
  /** Without these no Trust button is shown. */
  trustActions?: TrustActions;
}

export interface TrustActions {
  trust(domain: string): void;
  undo(domain: string): void;
  /** The undo window ended; the card can close. */
  done(): void;
}

const MAX_URL_CHARS = 120;
export const UNDO_MS = 5000;

const BUTTON_BASE =
  "cursor-pointer rounded-lg px-3 py-1.5 text-[12px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2";
const BUTTON_SECONDARY = `${BUTTON_BASE} border border-line bg-white text-ink hover:bg-chip focus-visible:outline-sus-fg`;
const BUTTON_DANGER = `${BUTTON_BASE} bg-high-bar text-white hover:bg-high-fg focus-visible:outline-high-fg`;
const BUTTON_QUIET = `${BUTTON_BASE} font-normal text-muted hover:text-ink focus-visible:outline-muted`;

// Full class strings so Tailwind's scanner finds them.
const THEME = {
  suspicious: { label: "Suspicious", header: "bg-sus-bg text-sus-fg", bar: "bg-sus-bar", pill: "bg-sus-bg text-sus-fg" },
  high: { label: "High risk", header: "bg-high-bg text-high-fg", bar: "bg-high-bar", pill: "bg-high-bg text-high-fg" },
} as const;

const ZONES = [
  { label: "safe", from: 0, width: SUSPICIOUS_THRESHOLD },
  { label: "suspicious", from: SUSPICIOUS_THRESHOLD, width: HIGH_THRESHOLD - SUSPICIOUS_THRESHOLD },
  { label: "high risk", from: HIGH_THRESHOLD, width: 100 - HIGH_THRESHOLD },
];

/** Event handlers that page scripts can't trigger with synthetic events. */
function trusted(fn: () => void) {
  return (e: Event) => {
    if (e.isTrusted) fn();
  };
}

function truncate(s: string, max: number): string {
  return s.length > max ? `${s.slice(0, max)}…` : s;
}

function TriangleIcon() {
  return (
    <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
      <path d="M12 9v4M12 17h.01" />
    </svg>
  );
}

function ShieldXIcon() {
  return (
    <svg viewBox="0 0 24 24" class="size-4 shrink-0" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
      <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
      <path d="m9.5 9.5 5 5M14.5 9.5l-5 5" />
    </svg>
  );
}

/** Copies via the async Clipboard API, falling back to execCommand on http:// pages where it doesn't exist. */
async function copyText(text: string, cardRoot: HTMLElement): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    // The scratch textarea lives inside the card's shadow root so the page never sees it.
    const shadow = cardRoot.getRootNode() as ShadowRoot | Document;
    const previous = shadow.activeElement as HTMLElement | null;
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("style", "position:fixed;opacity:0;");
    cardRoot.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    ta.remove();
    previous?.focus();
    return ok;
  }
}

export function Card({ analysis, href, placement, onMouseEnter, onMouseLeave, trustActions }: CardProps) {
  const [copied, setCopied] = useState(false);
  const [mode, setMode] = useState<"idle" | "confirm" | "trusted">("idle");
  const rootRef = useRef<HTMLDivElement>(null);
  /** Set when a button press swaps the footer, so keyboard focus follows into the new row. */
  const moveFocus = useRef(false);

  useLayoutEffect(() => {
    if (!moveFocus.current) return;
    moveFocus.current = false;
    rootRef.current?.querySelector<HTMLButtonElement>("[data-autofocus]")?.focus();
  }, [mode]);

  useEffect(() => {
    if (mode !== "trusted" || !trustActions) return;
    const t = window.setTimeout(() => trustActions.done(), UNDO_MS);
    return () => window.clearTimeout(t);
  }, [mode, trustActions]);

  if (analysis.level === "safe") return null;

  const t = THEME[analysis.level];
  const { destination, claimedDomain, reasons, score, rawScore } = analysis;
  const showClaim = claimedDomain !== null && claimedDomain !== destination.registrable;
  const currentZone = score >= HIGH_THRESHOLD ? "high risk" : score >= SUSPICIOUS_THRESHOLD ? "suspicious" : "safe";
  const isHigh = analysis.level === "high";

  const onCopy = trusted(() => {
    if (!rootRef.current) return;
    void copyText(href, rootRef.current).then((ok) => {
      if (ok) setCopied(true);
    });
  });
  // Never offer Trust for a raw IP: there's no domain to trust.
  const domain = trustActions ? destination.registrable : null;
  const switchTo = (next: typeof mode) => {
    const shadow = rootRef.current?.getRootNode() as ShadowRoot | Document | undefined;
    moveFocus.current = Boolean(shadow?.activeElement && rootRef.current?.contains(shadow.activeElement));
    setMode(next);
  };
  const doTrust = trusted(() => {
    if (!domain || !trustActions) return;
    trustActions.trust(domain);
    switchTo("trusted");
  });
  const doUndo = trusted(() => {
    if (!domain || !trustActions) return;
    trustActions.undo(domain);
    switchTo("idle");
  });
  const askConfirm = trusted(() => switchTo("confirm"));
  const cancelConfirm = trusted(() => switchTo("idle"));

  const style = placement
    ? `top:${placement.top}px;left:${placement.left}px;`
    : "top:0;left:0;visibility:hidden;";

  return (
    <div
      ref={rootRef}
      class="pg-root fixed w-[344px] overflow-hidden rounded-xl border border-line bg-white font-sans text-[13px] leading-snug text-ink [box-shadow:0_14px_36px_rgba(16,24,40,.20)] motion-safe:animate-pg-in"
      style={style}
      role="dialog"
      aria-label="PhishGuard link warning"
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
    >
      {/* 1. Header */}
      <div class={`flex items-center gap-2 px-4 py-2.5 ${t.header}`}>
        {isHigh ? <ShieldXIcon /> : <TriangleIcon />}
        <span class="text-[11px] font-bold uppercase tracking-[0.06em]">{t.label}</span>
        <span class="ml-auto text-[12px] font-semibold tabular-nums">{score} / 100 risk</span>
      </div>

      <div class="space-y-3.5 px-4 pt-3.5 pb-3">
        {/* 2. Score bar */}
        <div>
          <div class="relative h-2 rounded-full bg-divider">
            <div class={`h-full rounded-full ${t.bar}`} style={`width:${score}%`} />
            <div class="absolute inset-y-0 w-px bg-white" style={`left:${SUSPICIOUS_THRESHOLD}%`} />
            <div class="absolute inset-y-0 w-px bg-white" style={`left:${HIGH_THRESHOLD}%`} />
          </div>
          <div class="mt-1 flex text-[11px] text-muted">
            {ZONES.map((z) => (
              <span key={z.label} class={z.label === currentZone ? "font-bold text-ink" : ""} style={`width:${z.width}%`}>
                {z.label}
              </span>
            ))}
          </div>
        </div>

        {/* 3. Destination */}
        <div class="space-y-2">
          {showClaim && (
            <div>
              <div class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Link text says</div>
              <div class="font-mono text-[13px] break-all">{claimedDomain}</div>
            </div>
          )}
          <div>
            <div class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">Actually goes to</div>
            <div class="font-mono text-[13px] break-all">
              {destination.registrable ? (
                <>
                  {destination.subdomain && <span class="text-muted">{destination.subdomain}.</span>}
                  <span class="font-bold">{destination.registrable}</span>
                </>
              ) : (
                <span class="font-bold">{destination.host}</span>
              )}
            </div>
            <div class="mt-0.5 font-mono text-[11px] break-all text-muted">{truncate(analysis.url, MAX_URL_CHARS)}</div>
          </div>
        </div>

        {/* 4. Reasons */}
        <div class="border-t border-divider pt-3">
          <div class="text-[11px] font-semibold uppercase tracking-[0.06em] text-muted">
            Why it was flagged · {reasons.length} {reasons.length === 1 ? "rule" : "rules"}
          </div>
          <ul class="mt-1.5 space-y-1.5">
            {reasons.map((r) => (
              <li key={r.rule} class="flex items-start gap-2">
                <span class="flex-1">{r.message}</span>
                <span
                  class={`shrink-0 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums ${
                    r.points >= SUSPICIOUS_THRESHOLD ? t.pill : "bg-chip text-muted"
                  }`}
                >
                  +{r.points}
                </span>
              </li>
            ))}
          </ul>
          {rawScore > 100 && (
            <div class="mt-2.5 border-t border-dashed border-line pt-2 text-[11px] text-muted">
              Rules add up to {rawScore} · score is capped at 100
            </div>
          )}
        </div>
      </div>

      {/* 5. Footer */}
      <div class="border-t border-divider px-4 pt-2.5 pb-3">
        {mode === "trusted" ? (
          <div class="flex items-center gap-2" role="status">
            <span class="flex-1">
              Trusted <span class="font-mono font-semibold">{domain}</span>
            </span>
            <button type="button" class={BUTTON_SECONDARY} onClick={doUndo} data-autofocus>
              Undo
            </button>
          </div>
        ) : mode === "confirm" ? (
          <div class="space-y-2">
            <p>
              Trust <span class="font-mono font-semibold">{domain}</span>? It looks like a phishing link.
            </p>
            <div class="flex items-center gap-2">
              <button type="button" class={BUTTON_SECONDARY} onClick={cancelConfirm} data-autofocus>
                Cancel
              </button>
              <button type="button" class={BUTTON_DANGER} onClick={doTrust}>
                Yes, trust
              </button>
            </div>
          </div>
        ) : (
          <div class="flex flex-wrap items-center gap-2">
            {isHigh ? (
              <>
                <button type="button" class={BUTTON_DANGER} onClick={onCopy}>
                  {copied ? "Copied" : "Copy link to report"}
                </button>
                {domain && (
                  <button type="button" class={BUTTON_QUIET} onClick={askConfirm}>
                    Trust anyway…
                  </button>
                )}
              </>
            ) : (
              <>
                {domain && (
                  <button type="button" class={BUTTON_SECONDARY} onClick={doTrust}>
                    Trust {domain}
                  </button>
                )}
                <button type="button" class={BUTTON_SECONDARY} onClick={onCopy}>
                  {copied ? "Copied" : "Copy link"}
                </button>
              </>
            )}
          </div>
        )}
        <p class="mt-2 text-[11px] text-muted">PhishGuard · rule-based checks, nothing leaves your browser</p>
      </div>
    </div>
  );
}
