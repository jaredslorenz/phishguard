import { build } from "esbuild";
import { execFileSync } from "node:child_process";
import { cpSync, rmSync, mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";

const CONTENT_BUDGET_KB = 80;

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

const tailwind = (input, output) =>
  execFileSync("node_modules/.bin/tailwindcss", ["-i", input, "-o", output, "--minify"], { stdio: "inherit" });

// The card's CSS is built first; the content script imports it as a string for the shadow root.
tailwind("src/card/card.css", "build/card.css");
// The toolbar popup is our own page, so its CSS is a normal stylesheet.
tailwind("src/popup/popup.css", "dist/popup.css");

// Tailwind v4 gives its --tw-* variables default values with @property, which Chrome ignores inside a
// shadow root (borders and space-y would silently break). Tailwind also emits the same defaults as a
// fallback, but behind an @supports check that only matches older browsers: make that check always true.
const cardCss = readFileSync("build/card.css", "utf8");
const patched = cardCss.replace(/(@layer properties\{@supports )[^{]+\{/, "$1(display:block){");
if (patched === cardCss) {
  throw new Error("build/card.css: Tailwind's @layer properties fallback not found; the card would render without borders/spacing.");
}
writeFileSync("build/card.css", patched);

await build({
  entryPoints: {
    content: "src/content.ts",
    background: "src/background.ts",
    popup: "src/popup/main.tsx",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  loader: { ".css": "text" },
  // React ships its development build unless told otherwise.
  define: { "process.env.NODE_ENV": '"production"' },
  sourcemap: false,
  logLevel: "info",
});

cpSync("public", "dist", { recursive: true });

const contentKb = statSync("dist/content.js").size / 1024;
if (contentKb > CONTENT_BUDGET_KB) {
  console.warn(`\n⚠ dist/content.js is ${contentKb.toFixed(1)} KB, over the ${CONTENT_BUDGET_KB} KB budget.`);
}
