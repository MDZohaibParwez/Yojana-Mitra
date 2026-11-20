import type { Lang } from "./i18n/lang.js";
import type { SchemeLevel, SchemeRecord } from "./scheme.js";

export type Channel = "mcp" | "whatsapp" | "web" | "api";

export interface SchemeFilter {
  /** Include central schemes plus schemes of this state. */
  state?: string;
  level?: SchemeLevel;
  category?: string;
  includeClosed?: boolean;
}

export interface SearchHit {
  id: string;
  score: number;
}

/** Anonymous counter only — never names, phone numbers or IDs. */
export interface UsageEvent {
  channel: Channel;
  tool: string;
  state?: string | null;
  lang?: Lang | null;
  at?: Date;
}

export interface ReportInput {
  schemeId: string;
  message: string;
  channel: Channel;
}

/**
 * Storage abstraction. Implementations MUST only return schemes whose content
 * and eligibility rule are both review_status = 'approved'.
 */
export interface SchemeRepository {
  listSchemes(filter?: SchemeFilter): Promise<SchemeRecord[]>;
  getScheme(idOrSlug: string): Promise<SchemeRecord | null>;
  search(query: string, opts: { lang: Lang; limit: number; state?: string }): Promise<SearchHit[]>;
  createReport(input: ReportInput): Promise<{ id: string }>;
  recordUsage(event: UsageEvent): Promise<void>;
}

const normalize = (s: string) =>
  s
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{M}\p{N}\s]/gu, " ")
    .split(/\s+/)
    .filter((w) => w.length > 1);

/** In-memory repository used by tests, local dev without a DB, and as a fallback. */
export class InMemoryRepository implements SchemeRepository {
  reports: Array<ReportInput & { id: string; createdAt: Date }> = [];
  usage: UsageEvent[] = [];

  constructor(private schemes: SchemeRecord[]) {}

  async listSchemes(filter: SchemeFilter = {}): Promise<SchemeRecord[]> {
    return this.schemes.filter((s) => {
      if (!filter.includeClosed && s.status === "closed") return false;
      if (filter.level && s.level !== filter.level) return false;
      if (filter.category && s.category !== filter.category) return false;
      if (filter.state && s.level === "state" && s.stateCode !== filter.state) return false;
      return true;
    });
  }

  async getScheme(idOrSlug: string): Promise<SchemeRecord | null> {
    return this.schemes.find((s) => s.id === idOrSlug || s.slug === idOrSlug) ?? null;
  }

  async search(query: string, opts: { lang: Lang; limit: number; state?: string }): Promise<SearchHit[]> {
    const q = normalize(query);
    if (!q.length) return [];
    const pool = await this.listSchemes({ state: opts.state });
    const hits: SearchHit[] = [];
    for (const s of pool) {
      const hay = new Set(
        normalize(
          [
            s.slug.replace(/-/g, " "),
            s.category,
            ...s.tags,
            ...Object.values(s.text).flatMap((t) => (t ? [t.name, t.shortDescription, t.benefits] : [])),
          ].join(" "),
        ),
      );
      let score = 0;
      for (const w of q) {
        if (hay.has(w)) score += 1;
        else if ([...hay].some((h) => h.length > 3 && w.length > 3 && (h.startsWith(w) || w.startsWith(h)))) score += 0.5;
      }
      if (score > 0) hits.push({ id: s.id, score: score / q.length });
    }
    return hits.sort((a, b) => b.score - a.score).slice(0, opts.limit);
  }

  async createReport(input: ReportInput): Promise<{ id: string }> {
    const id = `rep_${this.reports.length + 1}`;
    this.reports.push({ ...input, id, createdAt: new Date() });
    return { id };
  }

  async recordUsage(event: UsageEvent): Promise<void> {
    this.usage.push({ ...event, at: event.at ?? new Date() });
  }
}
