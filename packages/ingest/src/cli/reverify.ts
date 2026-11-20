/** pnpm reverify — monthly link + content re-verification (scheduled via GitHub Actions). */
import { closeDb, getDb } from "@ym/db";
import { reverifyAll } from "../reverify.js";

reverifyAll(getDb().db)
  .then((s) => console.log("reverify done", s))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
