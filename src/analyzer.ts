import { parse } from "tldts";

export type Level = "safe" | "suspicious" | "high";

export interface Reason {
  rule: string;
  points: number;
  message: string;
}

export interface Destination {
  host: string;
  /** Registrable domain from tldts; null for a raw IP address. */
  registrable: string | null;
  subdomain: string;
}

export interface Analysis {
  url: string;
  /** Capped at 100. */
  score: number;
  /** Sum of reason points before the cap. */
  rawScore: number;
  level: Level;
  /** Sorted by points, highest first. */
  reasons: Reason[];
  /** Where the link really goes, after unwrapping known redirects. */
  destination: Destination;
  /** Registrable domain the link text claims, if the text looks like a URL. */
  claimedDomain: string | null;
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

/** Known-good services that host brand-named subdomains for their customers (csulb.instructure.com is Canvas). */
const TRUSTED_DOMAINS = new Set(["instructure.com"]);

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

/** A platform's own shortener on its own site, where every outbound link goes through it. */
const SHORTENER_HOMES: Record<string, string[]> = { "t.co": ["x.com", "twitter.com"] };

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

/** Count Public Suffix List private entries (github.io, vercel.app, web.app, s3.amazonaws.com...) as suffixes. */
const PRIVATE_SUFFIXES = { allowPrivateDomains: true };

/**
 * The site a host belongs to. On hosting platforms each customer is their own site: secure-paypal.vercel.app,
 * not vercel.app, so brand names in the customer's name are visible to the rules and trusting one github.io
 * site doesn't trust them all. Falls back to the ICANN domain for a host that is itself a private suffix
 * (s3.amazonaws.com).
 */
export function siteOf(host: string): string | null {
  return parse(host, PRIVATE_SUFFIXES).domain ?? parse(host).domain;
}

function registrableOfPage(pageUrl: string): string | null {
  if (!pageUrl) return null;
  try {
    return siteOf(new URL(pageUrl).hostname);
  } catch {
    return null;
  }
}

/** Host that the visible link text *claims* to point at, if the text looks like a URL/domain. */
function hostFromText(text: string): string | null {
  const t = text.trim().toLowerCase();
  if (!t || t.length > 120 || /\s/.test(t)) return null;
  const candidate = /^https?:\/\//.test(t) ? t : /^[a-z0-9-]+(\.[a-z0-9-]+)+(\/.*)?$/.test(t) ? `https://${t}` : null;
  if (!candidate) return null;
  try {
    const host = new URL(candidate).hostname;
    // "package.json" or "analyzer.ts" is a filename, not a domain: require a real domain ending.
    return parse(host).isIcann ? host : null;
  } catch {
    return null;
  }
}

/** RFC 1918 private ranges, loopback and link-local, for IPv4 and IPv6 (URL hostnames keep IPv6 brackets). */
function isPrivateIp(host: string): boolean {
  const h = host.replace(/^\[|\]$/g, "").toLowerCase();
  const v4 = h.match(/^(\d+)\.(\d+)\.\d+\.\d+$/);
  if (v4) {
    const [a, b] = [Number(v4[1]), Number(v4[2])];
    return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168) || (a === 169 && b === 254);
  }
  return h === "::1" || /^f[cd][0-9a-f]{2}:/.test(h) || /^fe[89ab][0-9a-f]:/.test(h);
}

function lastPathSegment(url: URL): string {
  const seg = url.pathname.split("/").filter(Boolean).pop() ?? "";
  try {
    return decodeURIComponent(seg).toLowerCase();
  } catch {
    return seg.toLowerCase();
  }
}

/**
 * Known redirect wrappers (Google/Gmail, Outlook SafeLinks, Facebook) carry the real destination in a
 * query parameter. Returns that destination so every rule runs on where the link actually goes.
 * Only these exact hosts/paths are unwrapped: a ?q= on any other site is not trusted.
 */
function unwrapRedirect(url: URL): URL | null {
  const host = url.hostname.toLowerCase();
  let target: string | null = null;
  if ((host === "www.google.com" || host === "google.com") && url.pathname === "/url") {
    target = url.searchParams.get("q") ?? url.searchParams.get("url");
  } else if (host.endsWith(".safelinks.protection.outlook.com")) {
    target = url.searchParams.get("url");
  } else if ((host === "l.facebook.com" || host === "lm.facebook.com") && url.pathname === "/l.php") {
    target = url.searchParams.get("u");
  }
  if (!target) return null;
  try {
    const inner = new URL(target);
    return inner.protocol === "http:" || inner.protocol === "https:" ? inner : null;
  } catch {
    return null;
  }
}

function notAnalyzed(rawUrl: string): Analysis {
  return {
    url: rawUrl,
    score: 0,
    rawScore: 0,
    level: "safe",
    reasons: [],
    destination: { host: "", registrable: null, subdomain: "" },
    claimedDomain: null,
  };
}

export interface AnalyzeOptions {
  /** Registrable domains the user chose to trust. They skip the brand-name and credential-word rules only. */
  trusted?: ReadonlySet<string>;
}

export function analyzeUrl(rawUrl: string, linkText = "", pageUrl = "", options: AnalyzeOptions = {}): Analysis {
  const reasons: Reason[] = [];
  const add = (rule: string, points: number, message: string) => reasons.push({ rule, points, message });

  let url: URL;
  try {
    url = new URL(rawUrl, pageUrl || undefined);
  } catch {
    return notAnalyzed(rawUrl);
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    return notAnalyzed(rawUrl);
  }

  // Bounded so nested wrappers can't loop forever.
  for (let i = 0; i < 3; i++) {
    const inner = unwrapRedirect(url);
    if (!inner) break;
    url = inner;
  }

  const host = url.hostname.toLowerCase();
  const info = parse(host, PRIVATE_SUFFIXES);
  // The ICANN view (github.io, amazonaws.com) answers "which company runs this?" for the built-in lists.
  const icann = parse(host);
  const registrable = info.domain ?? icann.domain;
  const label = registrable ? brandLabel(registrable) : "";
  const pageRegistrable = registrableOfPage(pageUrl);
  // Links back to the site you're already on can't be impersonating it, so the brand rules don't apply.
  const sameSite = registrable !== null && registrable === pageRegistrable;

  // Private/loopback addresses (routers, lab machines, localhost dev servers) can't host phishing for
  // someone on the internet, so the IP rules only apply to public addresses.
  const publicIp = info.isIp === true && !isPrivateIp(host);
  const credentialWord = CREDENTIAL_WORDS.find((w) => (host + url.pathname).toLowerCase().includes(w));

  // 1. Raw IP address instead of a domain name
  if (publicIp) {
    add("ip-host", 45, "Link goes to a raw IP address instead of a domain name");
    if (credentialWord) {
      add("credential-words", 10, `Contains "${credentialWord}" on a raw IP address`);
    }
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
  if (url.protocol === "http:" && (!info.isIp || publicIp)) {
    add("no-https", 10, "Link is not using HTTPS");
  }

  if (registrable && !info.isIp) {
    // Reputation, not deception: trust skips the brand rules and credential words, while ip-host, userinfo,
    // punycode and text-mismatch still run for trusted domains.
    // Built-in lists match the company's domain (raw.githubusercontent.com is GitHub's); user trust matches the
    // exact site, so trusting someone.github.io never trusts attacker.github.io.
    const company = icann.domain ?? registrable;
    const ownedByBrand =
      BRANDS.includes(company) ||
      BRAND_OWNED_DOMAINS.has(company) ||
      TRUSTED_DOMAINS.has(company) ||
      (options.trusted?.has(registrable) ?? false);

    if (!ownedByBrand && !sameSite) {
      // 5. Brand name placed in subdomain/path but real domain is something else. Hyphenated labels are split
      // too, so paypal-secure.com.evil.xyz is caught like paypal.com.evil.xyz.
      const subTokens = (info.subdomain ?? "").split(/[.-]/).filter(Boolean);
      const brandInSub = BRANDS.find((b) => subTokens.includes(brandLabel(b)));
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
    if (icann.publicSuffix && RISKY_TLDS.has(icann.publicSuffix)) {
      add("risky-tld", 10, `.${icann.publicSuffix} is a domain ending often abused in scams`);
    }

    // 11. URL shortener hides destination
    if (SHORTENERS.has(registrable)) {
      add("shortener", 15, "URL shortener hides the real destination");
    }

    // 12. Login-style words on a domain that isn't a known brand
    if (credentialWord && !ownedByBrand) {
      add("credential-words", 10, `Contains "${credentialWord}" on a domain that is not a known service`);
    }

    // 13. Excess hyphens
    if ((label.match(/-/g) ?? []).length >= 3) {
      add("many-hyphens", 15, "Domain name has many hyphens");
    }
  }

  // 14. Link text claims one site, href goes to another
  const claimedHost = hostFromText(linkText);
  const claimedDomain = claimedHost ? siteOf(claimedHost) : null;
  if (claimedDomain && registrable && claimedDomain !== registrable) {
    const claimsBrand = BRANDS.includes(claimedDomain);
    // Text "README.md" linking to .../README.md on the same site is a filename, not a claimed domain.
    const isFileLink = !claimsBrand && sameSite && lastPathSegment(url) === linkText.trim().toLowerCase();
    const isHomeShortener = !claimsBrand && (SHORTENER_HOMES[registrable] ?? []).includes(pageRegistrable ?? "");
    if (!isFileLink && !isHomeShortener) {
      // Claiming a known brand is always high. A shortener hides the destination, so we can't tell the
      // text is wrong: a non-brand claim through one only reaches "suspicious".
      const pts = claimsBrand ? 65 : SHORTENERS.has(registrable) ? 25 : 55;
      add("text-mismatch", pts, `Link text says ${claimedDomain} but it actually goes to ${registrable}`);
    }
  }

  // 15. Very long URL
  if (rawUrl.length > 150) {
    add("long-url", 10, "Very long URL");
  }

  reasons.sort((a, b) => b.points - a.points);
  const rawScore = reasons.reduce((s, r) => s + r.points, 0);
  const score = Math.min(100, rawScore);
  const level: Level = score >= HIGH_THRESHOLD ? "high" : score >= SUSPICIOUS_THRESHOLD ? "suspicious" : "safe";
  return {
    url: url.href,
    score,
    rawScore,
    level,
    reasons,
    destination: { host, registrable: info.isIp ? null : registrable, subdomain: info.subdomain ?? "" },
    claimedDomain,
  };
}
