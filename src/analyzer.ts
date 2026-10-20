import { parse } from "tldts";

export type Level = "safe" | "suspicious" | "high";

export interface Reason {
  rule: string;
  points: number;
  message: string;
}

export interface Analysis {
  url: string;
  score: number;
  level: Level;
  reasons: Reason[];
}

export const SUSPICIOUS_THRESHOLD = 30;
export const HIGH_THRESHOLD = 60;

/**
 * Small hand-picked sample of frequently impersonated brands (registrable domain).
 * Prototype only: a real version needs a much bigger, maintained list.
 */
const BRANDS = [
  "google.com",
  "paypal.com",
  "microsoft.com",
  "apple.com",
  "amazon.com",
  "facebook.com",
  "instagram.com",
  "netflix.com",
  "linkedin.com",
  "github.com",
  "dropbox.com",
  "chase.com",
  "bankofamerica.com",
  "wellsfargo.com",
  "csulb.edu",
];

/** Domains that legitimately contain a brand name but belong to the brand owner. */
const BRAND_OWNED_DOMAINS = new Set([
  "amazonaws.com",
  "googleapis.com",
  "googleusercontent.com",
  "gstatic.com",
  "microsoftonline.com",
  "githubusercontent.com",
  "fbcdn.net",
]);

const SHORTENERS = new Set([
  "bit.ly",
  "tinyurl.com",
  "t.co",
  "goo.gl",
  "ow.ly",
  "is.gd",
  "buff.ly",
  "rebrand.ly",
  "cutt.ly",
]);

/** TLDs that are cheap/abused often enough to deserve a small nudge, never a flag by themselves. */
const RISKY_TLDS = new Set(["zip", "mov", "top", "xyz", "tk", "ml", "ga", "cf", "gq", "click", "link", "work", "country"]);

const CREDENTIAL_WORDS = ["login", "signin", "sign-in", "verify", "account", "secure", "update", "password", "wallet"];

const LEET: Record<string, string> = { "0": "o", "1": "l", "3": "e", "5": "s", "$": "s", "@": "a" };

function normalizeLookalike(label: string): string {
  let out = "";
  for (const ch of label) out += LEET[ch] ?? ch;
  return out.replace(/rn/g, "m").replace(/vv/g, "w");
}

function levenshtein(a: string, b: string): number {
  const dp: number[] = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = dp[0]!;
    dp[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const tmp = dp[j]!;
      dp[j] = Math.min(dp[j]! + 1, dp[j - 1]! + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = tmp;
    }
  }
  return dp[b.length]!;
}

function brandLabel(domain: string): string {
  return domain.split(".")[0]!;
}

function registrableOf(host: string): string | null {
  return parse(host).domain;
}

/** Host that the visible link text *claims* to point at, if the text looks like a URL/domain. */
function hostFromText(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 120 || /\s/.test(t)) return null;
  const candidate = /^https?:\/\//.test(t) ? t : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/.test(t) ? `https://${t}` : null;
  if (!candidate) return null;
  try {
    return new URL(candidate).hostname;
  } catch {
    return null;
  }
}

export function analyzeUrl(rawUrl: string, linkText = "", pageUrl = ""): Analysis {
  const reasons: Reason[] = [];
  const add = (rule: string, points: number, message: string) => reasons.push({ rule, points, message });

  let url: URL;
  try {
    url = new URL(rawUrl, pageUrl || undefined);
  } catch {
    return { url: rawUrl, score: 0, level: "safe", reasons };
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return { url: rawUrl, score: 0, level: "safe", reasons };
  }

  const host = url.hostname.toLowerCase();
  const info = parse(host);
  const registrable = info.domain;
  const label = registrable ? brandLabel(registrable) : "";

  // 1. Raw IP address instead of a domain name
  if (info.isIp) {
    add("ip-host", 45, "Link goes to a raw IP address instead of a domain name");
  }

  // 2. user@host trick: https://paypal.com@evil.com
  if (url.username || url.password) {
    add("userinfo", 50, "URL contains a username/@ section, which can disguise the real destination");
  }

  // 3. Punycode / lookalike unicode domains
  if (host.split(".").some((l) => l.startsWith("xn--"))) {
    add("punycode", 40, "Domain uses punycode (xn--), which can hide lookalike characters");
  }

  // 4. Plain HTTP
  if (url.protocol === "http:" && !info.isIp) {
    add("no-https", 10, "Link is not using HTTPS");
  }

  if (registrable && !info.isIp) {
    const ownedByBrand = BRANDS.includes(registrable) || BRAND_OWNED_DOMAINS.has(registrable);

    if (!ownedByBrand) {
      // 5. Brand name placed in subdomain/path but real domain is something else
      const subLabels = (info.subdomain ?? "").split(".").filter(Boolean);
      const brandInSub = BRANDS.find((b) => subLabels.includes(brandLabel(b)));
      if (brandInSub) {
        add("brand-in-subdomain", 50, `Contains "${brandLabel(brandInSub)}" in the subdomain, but the real domain is ${registrable}`);
      }

      // 6. Brand as a separate token in the domain name (paypal-secure.com)
      const tokens = label.split("-");
      const brandToken = BRANDS.find((b) => tokens.length > 1 && tokens.includes(brandLabel(b)));
      if (brandToken) {
        add("brand-token", 45, `Domain name includes "${brandLabel(brandToken)}" but is not ${brandToken}`);
      }

      // 7. Lookalikes: paypa1.com, rnicrosoft.com, goggle.com
      for (const b of BRANDS) {
        const bl = brandLabel(b);
        if (label === bl) continue; // same name, different TLD handled below
        if (normalizeLookalike(label) === bl) {
          add("lookalike", 60, `Looks like ${b} using swapped characters (${registrable})`);
          break;
        }
        if (bl.length >= 6 && levenshtein(label, bl) === 1) {
          add("near-miss", 40, `One character away from ${b} (${registrable})`);
          break;
        }
      }

      // 8. Same brand name on a different TLD (paypal.co, google.xyz)
      const sameNameOtherTld = BRANDS.find((b) => brandLabel(b) === label && b !== registrable);
      if (sameNameOtherTld && label.length >= 6) {
        add("brand-other-tld", 35, `Uses the name of ${sameNameOtherTld} on a different domain ending`);
      }
    }

    // 9. Too many subdomain levels
    const subCount = (info.subdomain ?? "").split(".").filter(Boolean).length;
    if (subCount >= 3) {
      add("deep-subdomain", 20, `Unusually many subdomain levels (${subCount})`);
    }

    // 10. Risky TLD
    if (info.publicSuffix && RISKY_TLDS.has(info.publicSuffix)) {
      add("risky-tld", 10, `.${info.publicSuffix} is a domain ending often abused in scams`);
    }

    // 11. URL shortener hides destination
    if (SHORTENERS.has(registrable)) {
      add("shortener", 15, "URL shortener hides the real destination");
    }

    // 12. Login-style words on a domain that isn't a known brand
    const pathAndHost = (host + url.pathname).toLowerCase();
    const word = CREDENTIAL_WORDS.find((w) => pathAndHost.includes(w));
    if (word && !ownedByBrand) {
      add("credential-words", 10, `Contains "${word}" on a domain that is not a known service`);
    }

    // 13. Excess hyphens
    if ((label.match(/-/g) ?? []).length >= 3) {
      add("many-hyphens", 15, "Domain name has many hyphens");
    }
  }

  // 14. Link text claims one site, href goes to another
  const claimedHost = hostFromText(linkText);
  if (claimedHost) {
    const claimed = registrableOf(claimedHost);
    if (claimed && registrable && claimed !== registrable) {
      // Tracking redirects can cause benign mismatches, so a generic mismatch stays below "high";
      // claiming to be a known brand pushes it over.
      const pts = BRANDS.includes(claimed) ? 65 : 55;
      add("text-mismatch", pts, `Link text says ${claimed} but it actually goes to ${registrable}`);
    }
  }

  // 15. Very long URL
  if (rawUrl.length > 150) {
    add("long-url", 10, "Very long URL");
  }

  const score = Math.min(100, reasons.reduce((s, r) => s + r.points, 0));
  const level: Level = score >= HIGH_THRESHOLD ? "high" : score >= SUSPICIOUS_THRESHOLD ? "suspicious" : "safe";
  return { url: url.href, score, level, reasons };
}
