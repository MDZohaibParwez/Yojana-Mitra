import { mkdirSync, writeFileSync } from "node:fs";
import { OPENAPI } from "../openapi.js";

mkdirSync(new URL("../../../../docs/", import.meta.url), { recursive: true });
writeFileSync(new URL("../../../../docs/openapi.json", import.meta.url), JSON.stringify(OPENAPI, null, 2) + "\n");
console.log("wrote docs/openapi.json");
