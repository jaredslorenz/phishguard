# PhishGuard (prototype)

Early proof of concept: a Manifest V3 Chrome extension (TypeScript) that scans the links on a page, flags suspicious ones, and explains why in the popup.

## Run it
```
npm install
npm run build        # outputs dist/
npm test             # unit tests for the analyzer
```
Chrome → `chrome://extensions` → enable Developer mode → **Load unpacked** → select the `dist/` folder.

## How it works
- `src/analyzer.ts` – pure function `analyzeUrl(url, linkText)` → score, level (safe / suspicious / high), and a list of human-readable reasons. Rule-based; no network calls.
- `src/content.ts` – scans `<a href>` on the page (and re-scans on DOM changes), outlines flagged links, reports the count.
- `src/background.ts` – shows the flagged count as the toolbar badge.
- `src/popup.ts` – lists flagged links with the reasons.

## Rules (see analyzer.ts for weights)
Raw IP host, `user@host` trick, punycode, brand name in subdomain / as a hyphen token, character-swap lookalikes (paypa1), one-letter near misses, brand name on another TLD, link text that names a different domain than the href, many subdomains, risky TLDs, URL shorteners, login-style words, plain HTTP, long URLs. Weak signals alone do not flag a link.

## Known limitations
- Brand list is a small hand-picked sample (~15 domains).
- Only checks the URL string. It does not look at page content, redirects, domain age, or reputation feeds.
- Scores and weights are hand-tuned guesses, not measured against real phishing data. Expect false positives and misses.
- Does not scan links inside iframes or shadow DOM.
