import { defineConfig } from "tsup";

export default defineConfig([
  { entry: { server: "src/server.ts" }, outDir: "dist", format: "esm", platform: "node", target: "node20", noExternal: [/^@ym\//], splitting: false, clean: true },
]);
