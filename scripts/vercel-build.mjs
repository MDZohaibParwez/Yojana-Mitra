#!/usr/bin/env node
/**
 * Builds a Hono app into Vercel's Build Output API v3 layout (.vercel/output) so deployment
 * does not depend on Vercel discovering generated files in api/.
 *   node scripts/vercel-build.mjs <appDir> [--max-duration 30] [--cron "/path|schedule"]
 * The app must have src/node-handler.ts exporting a default Node (req, res) listener.
 */
import { build } from "esbuild";
import { mkdirSync, rmSync, writeFileSync } from "node:fs";
import { join, resolve } from "node:path";

const args = process.argv.slice(2);
const appDir = resolve(args[0]);
const opt = (n) => (args.includes(`--${n}`) ? args[args.indexOf(`--${n}`) + 1] : undefined);
const maxDuration = Number(opt("max-duration") ?? 30);
const crons = args.flatMap((a, i) => (a === "--cron" ? [args[i + 1]] : [])).map((c) => ({ path: c.split("|")[0], schedule: c.split("|")[1] }));

const out = join(appDir, ".vercel/output");
rmSync(out, { recursive: true, force: true });
const fn = join(out, "functions/index.func");
mkdirSync(fn, { recursive: true });

await build({
  entryPoints: [join(appDir, "src/node-handler.ts")],
  outfile: join(fn, "index.mjs"),
  bundle: true,
  platform: "node",
  target: "node22",
  format: "esm",
  sourcemap: false,
  minify: false,
  logLevel: "warning",
  // CJS deps inside an ESM bundle need require().
  banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" },
});
writeFileSync(join(fn, "package.json"), JSON.stringify({ type: "module" }));
writeFileSync(join(fn, ".vc-config.json"), JSON.stringify({ runtime: "nodejs22.x", handler: "index.mjs", launcherType: "Nodejs", maxDuration, supportsResponseStreaming: true }, null, 2));
writeFileSync(join(out, "config.json"), JSON.stringify({ version: 3, routes: [{ src: "/(.*)", dest: "/index" }], ...(crons.length ? { crons } : {}) }, null, 2));
console.log(`vercel output written to ${out}`);
