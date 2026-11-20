/** pnpm check-sources — fetch robots.txt for every registered source and print what it allows. */
import { PoliteFetcher, robotsAllows } from "../http.js";
import { SOURCES } from "../sources/registry.js";

const fetcher = new PoliteFetcher({ minDelayMs: 1000 });
for (const s of SOURCES) {
  const origin = new URL(s.baseUrl).origin;
  const rules = await fetcher.robotsFor(origin);
  const probe = s.kind === "myscheme" ? "/schemes/pm-kisan" : "/";
  console.log(
    `${s.id.padEnd(10)} ${origin.padEnd(36)} robots: ${robotsAllows(rules, probe) ? "allows" : "DISALLOWS"} ${probe}` +
      `${rules.crawlDelayMs ? ` crawl-delay ${rules.crawlDelayMs}ms` : ""} | terms reviewed: ${s.termsReviewed}`,
  );
}
