/**
 * Lifetime counters shown in the popup's Stats tab. Counts only: no URLs, link text or page content is
 * ever stored. Content scripts send deltas; the background service worker is the only writer.
 */

export const STATS_KEY = "stats";

export interface StatsDelta {
  linksScanned: number;
  pagesScanned: number;
  suspicious: number;
  high: number;
  /** Rule id → times it fired on a flagged link. */
  ruleCounts: Record<string, number>;
}

export interface Stats extends StatsDelta {
  /** When counting started (ms since epoch); reset sets it to now. */
  since: number;
}

const RULE_ID = /^[a-z0-9-]{1,40}$/;
const COUNTERS = ["linksScanned", "pagesScanned", "suspicious", "high"] as const;

const count = (v: unknown): number => (typeof v === "number" && Number.isFinite(v) && v > 0 ? Math.floor(v) : 0);

export function emptyDelta(): StatsDelta {
  return { linksScanned: 0, pagesScanned: 0, suspicious: 0, high: 0, ruleCounts: {} };
}

export function emptyStats(now: number): Stats {
  return { since: now, ...emptyDelta() };
}

export function isEmptyDelta(d: StatsDelta): boolean {
  return COUNTERS.every((k) => d[k] === 0) && Object.keys(d.ruleCounts).length === 0;
}

/** Adds a delta to stats (or to another delta). Returns a new object. */
export function addDelta<T extends StatsDelta>(base: T, d: StatsDelta): T {
  const ruleCounts = { ...base.ruleCounts };
  for (const [rule, n] of Object.entries(d.ruleCounts)) ruleCounts[rule] = (ruleCounts[rule] ?? 0) + n;
  const out = { ...base, ruleCounts };
  for (const k of COUNTERS) out[k] = base[k] + d[k];
  return out;
}

/** Keeps only non-negative integer counters and rule ids that look like rule ids. */
export function sanitizeDelta(value: unknown): StatsDelta {
  const v = (value ?? {}) as Partial<Record<keyof StatsDelta, unknown>>;
  const d = emptyDelta();
  for (const k of COUNTERS) d[k] = count(v[k]);
  if (v.ruleCounts && typeof v.ruleCounts === "object") {
    for (const [rule, n] of Object.entries(v.ruleCounts)) {
      if (RULE_ID.test(rule) && count(n) > 0) d.ruleCounts[rule] = count(n);
    }
  }
  return d;
}

/** Reads a stored value, falling back to fresh stats when it is missing or malformed. */
export function toStats(value: unknown, now: number): Stats {
  if (!value || typeof value !== "object") return emptyStats(now);
  const since = (value as { since?: unknown }).since;
  return { since: typeof since === "number" && since > 0 ? since : now, ...sanitizeDelta(value) };
}

export function topRules(stats: StatsDelta, n: number): [rule: string, count: number][] {
  return Object.entries(stats.ruleCounts)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, n);
}
