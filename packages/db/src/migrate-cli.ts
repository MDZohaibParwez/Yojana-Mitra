import { closeDb } from "./client.js";
import { runMigrations } from "./migrate.js";

runMigrations()
  .then(() => console.log("migrations applied"))
  .catch((e) => {
    console.error(e);
    process.exitCode = 1;
  })
  .finally(closeDb);
