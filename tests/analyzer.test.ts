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

  it("ignores non-http schemes and garbage", () => {
    expect(analyzeUrl("mailto:a@b.com").level).toBe("safe");
    expect(analyzeUrl("javascript:void(0)").level).toBe("safe");
    expect(analyzeUrl("not a url").level).toBe("safe");
  });
});

describe("phishing patterns get flagged", () => {
  it("raw IP login page", () => {
    const a = analyzeUrl("http://192.168.10.5/login/verify");
    expect(a.level).not.toBe("safe");
    expect(a.reasons.map((r) => r.rule)).toContain("ip-host");
  });

  it("brand in subdomain of another domain", () => {
    const a = analyzeUrl("https://paypal.com.account-check.xyz/signin");
    expect(a.level).toBe("high");
    expect(rules("https://paypal.com.account-check.xyz/signin")).toContain("brand-in-subdomain");
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
