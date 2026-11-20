import type { PoliteFetcher } from "../http.js";

/** What every importer produces before normalisation. Text is the official wording. */
export interface RawScheme {
  sourceId: string;
  url: string;
  slugHint?: string;
  name: string;
  ministry?: string;
  level: "central" | "state";
  stateCode: string | null;
  applyUrl?: string;
  tags?: string[];
  deadline?: string | null;
  sections: {
    details?: string;
    benefits?: string;
    eligibility?: string;
    exclusions?: string;
    applicationProcess?: string;
    documents?: string;
  };
}

export interface SourceConfig {
  id: string;
  name: string;
  kind: "myscheme" | "html";
  baseUrl: string;
  stateCode: string | null;
  /** html sources: index page(s) that link to scheme pages */
  listUrls?: string[];
  /** html sources: regex a link href must match to be treated as a scheme page */
  linkPattern?: string;
  rateLimitMs: number;
  /**
   * Importers stay disabled until a human has read the portal's Terms of Use
   * and recorded the outcome in DATA_SOURCES.md.
   */
  termsReviewed: boolean;
  notes?: string;
}

export interface Importer {
  list(fetcher: PoliteFetcher, limit?: number): Promise<string[]>;
  fetchScheme(fetcher: PoliteFetcher, url: string): Promise<RawScheme | null>;
}
