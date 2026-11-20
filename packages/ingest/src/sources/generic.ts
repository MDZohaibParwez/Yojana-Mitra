import type { PoliteFetcher } from "../http.js";
import { extractLinks, extractSections } from "./html.js";
import type { Importer, RawScheme, SourceConfig } from "./types.js";

/** Config-driven importer for state / ministry portals that publish one HTML page per scheme. */
export function htmlImporter(cfg: SourceConfig): Importer {
  return {
    async list(fetcher: PoliteFetcher, limit = Infinity) {
      if (!cfg.listUrls?.length || !cfg.linkPattern) return [];
      const re = new RegExp(cfg.linkPattern, "i");
      const out = new Set<string>();
      for (const u of cfg.listUrls) for (const l of extractLinks(await fetcher.text(u), u, re)) out.add(l);
      return [...out].slice(0, limit);
    },
    async fetchScheme(fetcher, url): Promise<RawScheme | null> {
      const s = extractSections(await fetcher.text(url));
      if (!s.title || !s.eligibility) return null;
      const { title, ...sections } = s;
      return {
        sourceId: cfg.id,
        url,
        name: title,
        level: cfg.stateCode ? "state" : "central",
        stateCode: cfg.stateCode,
        sections,
      };
    },
  };
}
