import { defineConfig } from "tsup";

export default defineConfig([
  // Vercel function: everything bundled into one file so no workspace TS needs resolving at deploy time.
  { entry: { index: "src/vercel.ts" }, outDir: "api", format: "esm", platform: "node", target: "node20", noExternal: [/.*/], splitting: false, clean: true, banner: { js: "import { createRequire as __cr } from 'module'; const require = __cr(import.meta.url);" } },
  { entry: { server: "src/server.ts" }, outDir: "dist", format: "esm", platform: "node", target: "node20", noExternal: [/^@ym\//], splitting: false, clean: true },
]);
