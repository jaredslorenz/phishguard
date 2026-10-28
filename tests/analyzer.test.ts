import { describe, expect, it } from "vitest";
import { analyzeUrl } from "../src/analyzer";

const rules = (url: string, text = "") => analyzeUrl(url, text).reasons.map((r) => r.rule);

describe("legitimate links stay safe", () => {
  it.each([
    "https://www.google.com/search?q=cats",
    "https://accounts.google.com/signin",
    "https://github.com/anthropics",
    "https://www.csulb.edu/engineering",
    "https://s3.amazonaws.com/bucket/file.png",
    "https://en.wikipedia.org/wiki/Phishing",
    "https://login.microsoftonline.com/common/oauth2",
    "https://www.example.co.uk/",
  ])("%s", (url) => {
    const a = analyzeUrl(url);
    expect(a.level).toBe("safe");
  });

  it.each([
    ["https://csulb.instructure.com/courses/1/modules", "https://csulb.instructure.com/courses/1"],
    ["https://csulb.instructure.com/courses/1/modules", ""],
    ["https://mail.google.com/mail/u/0/#inbox", "https://mail.google.com/mail/u/0/"],
    ["https://github.com/jaredslorenz/phishguard", "https://github.com/"],
    ["https://accounts.google.com/v3/signin/identifier", "https://www.google.com/"],
    ["https://en.wikipedia.org/wiki/Phishing", "https://en.wikipedia.org/wiki/Main_Page"],
  ])("known-good regression: %s on %s", (url, pageUrl) => {
    expect(analyzeUrl(url, "", pageUrl).level).toBe("safe");
  });

  it("same-site links skip brand rules", () => {
    const a = analyzeUrl("https://paypal.someschool.edu/club", "", "https://www.someschool.edu/");
    expect(a.reasons.map((r) => r.rule)).not.toContain("brand-in-subdomain");
  });

  it("ignores non-http schemes and garbage", () => {
    expect(analyzeUrl("mailto:a@b.com").level).toBe("safe");
    expect(analyzeUrl("javascript:void(0)").level).toBe("safe");
    expect(analyzeUrl("not a url").level).toBe("safe");
  });
});

describe("phishing patterns get flagged", () => {
  it("raw public IP login page over HTTP is high", () => {
    const a = analyzeUrl("http://203.0.113.5/login/verify");
    expect(a.level).toBe("high");
    expect(a.reasons.map((r) => r.rule)).toEqual(expect.arrayContaining(["ip-host", "credential-words", "no-https"]));
  });

  it("raw public IP alone is still suspicious", () => {
    expect(analyzeUrl("https://203.0.113.5/").level).toBe("suspicious");
  });

  it.each([
    "http://192.168.1.1/login",
    "http://10.0.0.1/admin/password",
    "http://172.20.5.4/signin",
    "http://127.0.0.1:3000/login",
    "http://[::1]:8080/account",
    "http://localhost:5173/login",
  ])("private and local addresses are not flagged: %s", (url) => {
    expect(analyzeUrl(url).level).toBe("safe");
  });

  it("only RFC 1918 172.16-31 counts as private", () => {
    expect(analyzeUrl("http://172.32.0.1/login").reasons.map((r) => r.rule)).toContain("ip-host");
  });

  it("brand in subdomain of another domain", () => {
    const a = analyzeUrl("https://paypal.com.account-check.xyz/signin");
    expect(a.level).toBe("high");
    expect(rules("https://paypal.com.account-check.xyz/signin")).toContain("brand-in-subdomain");
  });

  it("same-site exemption does not leak to other sites", () => {
    const a = analyzeUrl("https://paypal.com.account-check.xyz/signin", "", "https://www.google.com/");
    expect(a.level).toBe("high");
    expect(a.reasons.map((r) => r.rule)).toContain("brand-in-subdomain");
  });

  it("brand as token in domain", () => {
    expect(rules("https://paypal-secure.com/")).toContain("brand-token");
    expect(analyzeUrl("https://paypal-secure.com/").level).not.toBe("safe");
  });

  it("character-swap lookalike", () => {
    expect(rules("https://paypa1.com/")).toContain("lookalike");
    expect(rules("https://rnicrosoft.com/")).toContain("lookalike");
    expect(analyzeUrl("https://paypa1.com/").level).toBe("high");
  });

  it("one-character near miss", () => {
    expect(rules("https://goggle.com/")).toContain("near-miss");
  });

  it("brand name on another TLD", () => {
    expect(rules("https://paypal.co/")).toContain("brand-other-tld");
  });

  it("userinfo trick", () => {
    expect(rules("https://paypal.com@evil.example.net/")).toContain("userinfo");
    expect(analyzeUrl("https://paypal.com@evil.example.net/").level).not.toBe("safe");
  });

  it("punycode domain", () => {
    expect(rules("https://xn--pple-43d.com/")).toContain("punycode");
  });

  it("link text claims a different site", () => {
    const a = analyzeUrl("https://evil-site.net/x", "www.paypal.com");
    expect(a.reasons.map((r) => r.rule)).toContain("text-mismatch");
    expect(a.level).toBe("high");
  });

  it("matching link text is fine", () => {
    expect(analyzeUrl("https://www.google.com/", "google.com").level).toBe("safe");
  });

  it("every flagged result explains itself", () => {
    const a = analyzeUrl("https://paypa1.com/");
    expect(a.reasons.length).toBeGreaterThan(0);
    expect(a.reasons.every((r) => r.message.length > 0)).toBe(true);
  });
});

describe("weak signals alone do not flag", () => {
  it("plain http to a normal site", () => {
    expect(analyzeUrl("http://example.org/page").level).toBe("safe");
  });

  it("risky TLD alone", () => {
    expect(analyzeUrl("https://my-small-blog.xyz/").level).toBe("safe");
  });

  it("shortener alone", () => {
    expect(analyzeUrl("https://bit.ly/abc123").level).toBe("safe");
  });
});

describe("everyday link-text mismatches stay safe", () => {
  it.each([
    ["https://github.com/me/repo/blob/main/README.md", "README.md", "https://github.com/me/repo"],
    ["https://github.com/me/repo/blob/main/package.json", "package.json", "https://github.com/me/repo"],
    ["https://github.com/me/repo/blob/main/src/analyzer.ts", "analyzer.ts", "https://github.com/me/repo"],
    ["https://www.google.com/url?q=https://www.csulb.edu/&sa=D", "csulb.edu", "https://mail.google.com/mail/u/0/"],
    ["https://nam02.safelinks.protection.outlook.com/?url=https%3A%2F%2Fwww.csulb.edu%2F", "csulb.edu", "https://outlook.office.com/"],
    ["https://t.co/abc123", "nytimes.com/2026/10/27/story", "https://x.com/someone/status/1"],
  ])("%s with text %s", (url, text, pageUrl) => {
    expect(analyzeUrl(url, text, pageUrl).level).toBe("safe");
  });
});

describe("mismatch exemptions cannot be abused", () => {
  it("brand name as the filename on the attacker's own site", () => {
    const a = analyzeUrl("https://evil.net/paypal.com", "paypal.com", "https://evil.net/");
    expect(a.level).toBe("high");
    expect(a.reasons.map((r) => r.rule)).toContain("text-mismatch");
  });

  it("filename exemption only applies to same-site links", () => {
    const a = analyzeUrl("https://evil.net/files/invoice.md", "invoice.md", "https://mail.google.com/");
    expect(a.reasons.map((r) => r.rule)).toContain("text-mismatch");
  });

  it("?q= on an unknown site is not unwrapped", () => {
    const a = analyzeUrl("https://evil.net/r?q=https://www.paypal.com/", "paypal.com");
    expect(a.level).toBe("high");
  });

  it("a Google redirect to a phishing site is judged on the real destination", () => {
    const a = analyzeUrl("https://www.google.com/url?q=https://paypa1.com/login");
    expect(a.level).toBe("high");
    expect(a.reasons.map((r) => r.rule)).toContain("lookalike");
  });

  it("nested redirect wrappers are unwrapped", () => {
    const inner = encodeURIComponent("https://www.google.com/url?q=https://paypa1.com/");
    expect(analyzeUrl(`https://l.facebook.com/l.php?u=${inner}`).level).toBe("high");
  });

  it("a shortener claiming to be a brand is still high", () => {
    expect(analyzeUrl("https://bit.ly/x1", "paypal.com").level).toBe("high");
  });

  it("t.co off its home platform with a mismatched claim is still suspicious", () => {
    expect(analyzeUrl("https://t.co/abc123", "nytimes.com", "https://news.example.com/").level).toBe("suspicious");
  });
});

describe("richer analysis results", () => {
  const samples: [string, string, string][] = [
    ["https://paypal.com.account-check.xyz/signin", "www.paypal.com", ""],
    ["http://192.168.10.5/login/verify", "", ""],
    ["https://paypa1.com/", "", ""],
    ["https://www.google.com/search?q=cats", "", ""],
    ["https://bit.ly/x1", "paypal.com", ""],
  ];

  it.each(samples)("score is min(100, rawScore) and rawScore is the sum of points: %s", (url, text, page) => {
    const a = analyzeUrl(url, text, page);
    expect(a.rawScore).toBe(a.reasons.reduce((s, r) => s + r.points, 0));
    expect(a.score).toBe(Math.min(100, a.rawScore));
  });

  it("keeps the uncapped total when rules add up past 100", () => {
    const a = analyzeUrl("https://paypal.com.account-check.xyz/signin", "www.paypal.com");
    expect(a.rawScore).toBeGreaterThan(100);
    expect(a.score).toBe(100);
  });

  it("sorts reasons by points, highest first", () => {
    const pts = analyzeUrl("https://paypal.com.account-check.xyz/signin", "www.paypal.com").reasons.map((r) => r.points);
    expect(pts).toEqual([...pts].sort((x, y) => y - x));
  });

  it("splits the destination into subdomain and registrable domain", () => {
    const { destination } = analyzeUrl("https://paypal.com.account-check.xyz/signin");
    expect(destination).toEqual({ host: "paypal.com.account-check.xyz", registrable: "account-check.xyz", subdomain: "paypal.com" });
  });

  it("has no registrable domain for a raw IP", () => {
    expect(analyzeUrl("http://192.168.10.5/login").destination).toEqual({ host: "192.168.10.5", registrable: null, subdomain: "" });
  });

  it("reports the unwrapped destination for redirect wrappers", () => {
    expect(analyzeUrl("https://www.google.com/url?q=https://paypa1.com/login").destination.registrable).toBe("paypa1.com");
  });

  it("reports the domain the link text claims", () => {
    expect(analyzeUrl("https://evil-site.net/x", "https://www.paypal.com/login").claimedDomain).toBe("paypal.com");
    expect(analyzeUrl("https://evil-site.net/x", "Click here").claimedDomain).toBeNull();
    expect(analyzeUrl("https://github.com/a/b/blob/main/package.json", "package.json").claimedDomain).toBeNull();
  });

  it.each(["not a url", "mailto:a@b.com", "javascript:void(0)"])("early return %s has safe defaults", (url) => {
    expect(analyzeUrl(url, "paypal.com")).toEqual({
      url,
      score: 0,
      rawScore: 0,
      level: "safe",
      reasons: [],
      destination: { host: "", registrable: null, subdomain: "" },
      claimedDomain: null,
    });
  });
});

describe("user-trusted domains", () => {
  const trusted = new Set(["paypal-secure.com"]);

  it("a trusted domain scores safe", () => {
    expect(analyzeUrl("https://paypal-secure.com/login").level).not.toBe("safe");
    expect(analyzeUrl("https://paypal-secure.com/login", "", "", { trusted }).level).toBe("safe");
  });

  it("instructure.com stays safe with or without options", () => {
    expect(analyzeUrl("https://csulb.instructure.com/", "", "", { trusted: new Set(["instructure.com"]) }).level).toBe("safe");
  });

  it("deception rules still fire on a trusted domain", () => {
    const userinfo = analyzeUrl("https://paypal.com@paypal-secure.com/", "", "", { trusted });
    expect(userinfo.reasons.map((r) => r.rule)).toContain("userinfo");
    expect(userinfo.level).not.toBe("safe");

    const mismatch = analyzeUrl("https://paypal-secure.com/", "www.paypal.com", "", { trusted });
    expect(mismatch.reasons.map((r) => r.rule)).toContain("text-mismatch");
    expect(mismatch.level).toBe("high");
  });

  it("trust is per registrable domain and does not leak to hosts that merely contain it", () => {
    for (const url of ["https://paypal-secure.com.evil.xyz/login", "https://login.paypal-secure.co/"]) {
      expect(analyzeUrl(url, "", "", { trusted })).toEqual(analyzeUrl(url));
    }
  });

  it.each([
    ["https://paypal.com.account-check.xyz/signin", "www.paypal.com", ""],
    ["http://203.0.113.5/login/verify", "", ""],
    ["https://paypa1.com/", "", ""],
    ["https://csulb.instructure.com/courses/1", "", "https://csulb.instructure.com/"],
    ["https://www.google.com/url?q=https://paypa1.com/", "", ""],
  ])("an empty options object changes nothing: %s", (url, text, page) => {
    const base = analyzeUrl(url, text, page);
    expect(analyzeUrl(url, text, page, {})).toEqual(base);
    expect(analyzeUrl(url, text, page, { trusted: new Set() })).toEqual(base);
  });
});
