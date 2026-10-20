import { build } from "esbuild";
import { cpSync, rmSync, mkdirSync } from "node:fs";

rmSync("dist", { recursive: true, force: true });
mkdirSync("dist", { recursive: true });

await build({
  entryPoints: {
    content: "src/content.ts",
    background: "src/background.ts",
    popup: "src/popup.ts",
  },
  outdir: "dist",
  bundle: true,
  format: "iife",
  target: "chrome120",
  sourcemap: false,
  logLevel: "info",
});

cpSync("public", "dist", { recursive: true });
