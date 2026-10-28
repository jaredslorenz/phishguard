/** Short names for analyzer rule ids, for the Stats tab. */
const RULE_LABELS: Record<string, string> = {
  "ip-host": "Raw IP address",
  userinfo: "Hidden @ in the link",
  punycode: "Punycode domain",
  "no-https": "No HTTPS",
  "brand-in-subdomain": "Brand in subdomain",
  "brand-token": "Brand in domain name",
  lookalike: "Lookalike characters",
  "near-miss": "One letter off a brand",
  "brand-other-tld": "Brand on another ending",
  "deep-subdomain": "Many subdomains",
  "risky-tld": "Risky domain ending",
  shortener: "URL shortener",
  "credential-words": "Login-style words",
  "many-hyphens": "Many hyphens",
  "text-mismatch": "Link text doesn't match",
  "long-url": "Very long URL",
};

export const ruleLabel = (rule: string): string => RULE_LABELS[rule] ?? rule;
