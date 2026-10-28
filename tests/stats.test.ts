import { describe, expect, it } from "vitest";
import { analyzeUrl } from "../src/analyzer";
import { addDelta, emptyDelta, emptyStats, isEmptyDelta, sanitizeDelta, toStats, topRules, type StatsDelta } from "../src/stats";

const delta = (d: Partial<StatsDelta>): StatsDelta => ({ ...emptyDelta(), ...d });

describe("stats reducer", () => {
  it("adds deltas, including rule counts", () => {
    let s = emptyStats(1000);
    s = addDelta(s, delta({ linksScanned: 10, pagesScanned: 1, suspicious: 2, high: 1, ruleCounts: { "ip-host": 1, lookalike: 2 } }));
    s = addDelta(s, delta({ linksScanned: 5, high: 1, ruleCounts: { lookalike: 1, "text-mismatch": 1 } }));
    expect(s).toEqual({
      since: 1000,
      linksScanned: 15,
      pagesScanned: 1,
      suspicious: 2,
      high: 2,
      ruleCounts: { "ip-host": 1, lookalike: 3, "text-mismatch": 1 },
    });
  });

  it("does not mutate its inputs", () => {
    const base = emptyStats(1);
    const d = delta({ ruleCounts: { lookalike: 1 } });
    addDelta(base, d);
    expect(base).toEqual(emptyStats(1));
    expect(d.ruleCounts).toEqual({ lookalike: 1 });
  });

  it("reset gives zero counts and a new start time", () => {
    expect(emptyStats(2000)).toEqual({ since: 2000, linksScanned: 0, pagesScanned: 0, suspicious: 0, high: 0, ruleCounts: {} });
  });

  it("knows an empty delta", () => {
    expect(isEmptyDelta(emptyDelta())).toBe(true);
    expect(isEmptyDelta(delta({ pagesScanned: 1 }))).toBe(false);
  });

  it("lists the most-fired rules first, ties alphabetical", () => {
    const s = delta({ ruleCounts: { a: 1, b: 5, c: 3, d: 5, e: 2, f: 4 } });
    expect(topRules(s, 3)).toEqual([["b", 5], ["d", 5], ["f", 4]]);
  });
});

describe("stored stats stay counts-only", () => {
  it("drops anything that is not a count or a rule id", () => {
    const d = sanitizeDelta({
      linksScanned: 3.7,
      pagesScanned: -2,
      suspicious: "9",
      high: Number.NaN,
      url: "https://paypa1.com/login",
      ruleCounts: { lookalike: 2, "https://evil.example/": 1, "Link text": 1, "ip-host": "x" },
    });
    expect(d).toEqual({ linksScanned: 3, pagesScanned: 0, suspicious: 0, high: 0, ruleCounts: { lookalike: 2 } });
  });

  it("contains no URL or link text after counting real flagged links", () => {
    const links: [string, string][] = [
      ["https://paypal.com.account-check.xyz/signin", "www.paypal.com"],
      ["http://203.0.113.5/login/verify", "Verify account"],
      ["https://paypa1.com/", "Sign in to PayPal"],
    ];
    let s = emptyStats(1);
    for (const [url, text] of links) {
      const a = analyzeUrl(url, text);
      const d = emptyDelta();
      d.linksScanned = 1;
      if (a.level !== "safe") d[a.level] = 1;
      for (const r of a.reasons) d.ruleCounts[r.rule] = 1;
      s = addDelta(s, sanitizeDelta(d));
    }
    const json = JSON.stringify(s);
    expect(json).not.toMatch(/https?:|www\.|paypa|account-check|203\.0|Sign in|Verify/i);
    expect(s.high + s.suspicious).toBe(3);
  });

  it("falls back to fresh stats for a missing or corrupt stored value", () => {
    expect(toStats(undefined, 5)).toEqual(emptyStats(5));
    expect(toStats("garbage", 5)).toEqual(emptyStats(5));
    expect(toStats({ since: -1, linksScanned: 4 }, 5)).toEqual({ ...emptyStats(5), linksScanned: 4 });
  });
});
