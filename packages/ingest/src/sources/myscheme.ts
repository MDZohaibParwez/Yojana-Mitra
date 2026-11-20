import { STATES } from "@ym/core";
import type { PoliteFetcher } from "../http.js";
import { cleanText, extractSections, parseSitemap } from "./html.js";
import type { Importer, RawScheme } from "./types.js";

/**
 * myScheme.gov.in importer (National e-Governance Division, MeitY).
 *
 * Discovers scheme pages from the public sitemap and parses each public scheme
 * page. It deliberately does NOT call myScheme's internal search API (that needs
 * an API key embedded in the web app and is not offered for third-party use).
 *
 * Page structure: a Next.js app. We read `__NEXT_DATA__` when present (more
 * robust), else fall back to heading-based section extraction.
 */
export const MYSCHEME_BASE = "https://www.myscheme.gov.in";

type Json = unknown;

function findKey(obj: Json, keys: string[], depth = 0): Json | undefined {
  if (!obj || typeof obj !== "object" || depth > 12) return undefined;
  for (const k of keys) if (k in (obj as Record<string, Json>)) return (obj as Record<string, Json>)[k];
  for (const v of Object.values(obj as Record<string, Json>)) {
    const r = findKey(v, keys, depth + 1);
    if (r !== undefined) return r;
  }
  return undefined;
}

/** Flatten rich-text JSON (Slate-style {children:[{text}]}) or strings into plain text. */
export function richToText(v: Json): string {
  if (v == null) return "";
  if (typeof v === "string") return v;
  if (Array.isArray(v)) return v.map(richToText).filter(Boolean).join("\n");
  if (typeof v === "object") {
    const o = v as Record<string, Json>;
    if (typeof o.text === "string") return o.text;
    if (o.children) {
      const inner = richToText(o.children);
      return o.type === "list_item" || o.type === "li" ? `• ${inner}` : inner;
    }
    return Object.values(o).map(richToText).filter(Boolean).join("\n");
  }
  return String(v);
}

function stateFromName(name?: string): string | null {
  if (!name) return null;
  const n = name.toLowerCase();
  return STATES.find((s) => s.en.toLowerCase() === n || s.aliases.some((a) => a === n))?.code ?? null;
}

export function parseMySchemePage(html: string, url: string): RawScheme | null {
  const slug = new URL(url).pathname.split("/").filter(Boolean).pop();
  let raw: RawScheme | null = null;
  const m = html.match(/<script id="__NEXT_DATA__"[^>]*>([\s\S]*?)<\/script>/);
  if (m) {
    try {
      const data = JSON.parse(m[1]!) as Json;
      const name = findKey(data, ["schemeName", "scheme_name"]);
      if (typeof name === "string") {
        const level = String(findKey(data, ["level", "schemeLevel"]) ?? "").toLowerCase();
        const stateName = findKey(data, ["beneficiaryState", "state"]);
        const stateCode = stateFromName(Array.isArray(stateName) ? String(stateName[0] ?? "") : String(stateName ?? ""));
        const ministry = findKey(data, ["nodalMinistryName", "ministryName", "nodalDepartmentName"]);
        const tags = findKey(data, ["tags"]);
        raw = {
          sourceId: "myscheme",
          url,
          slugHint: slug,
          name: cleanText(name),
          ministry: typeof ministry === "string" ? ministry : richToText(ministry) || undefined,
          level: level.includes("state") && stateCode ? "state" : "central",
          stateCode: level.includes("state") ? stateCode : null,
          tags: Array.isArray(tags) ? tags.map(String) : [],
          sections: {
            details: cleanText(richToText(findKey(data, ["detailedDescription_md", "detailedDescription", "briefDescription"]))),
            benefits: cleanText(richToText(findKey(data, ["benefits_md", "benefits"]))),
            eligibility: cleanText(richToText(findKey(data, ["eligibilityDescription_md", "eligibilityDescription", "eligibility"]))),
            exclusions: cleanText(richToText(findKey(data, ["exclusions_md", "exclusions"]))),
            applicationProcess: cleanText(richToText(findKey(data, ["applicationProcess"]))),
            documents: cleanText(richToText(findKey(data, ["documents_required_md", "documentsRequired", "documents"]))),
          },
        };
        const apply = findKey(data, ["applicationUrl", "applyUrl", "url"]);
        if (typeof apply === "string" && apply.startsWith("https://")) raw.applyUrl = apply;
      }
    } catch {
      raw = null;
    }
  }
  if (!raw) {
    const s = extractSections(html);
    if (!s.title) return null;
    const { title, ...sections } = s;
    raw = { sourceId: "myscheme", url, slugHint: slug, name: title, level: "central", stateCode: null, sections };
  }
  if (!raw.sections.eligibility) return null; // cannot build rules without eligibility text
  return raw;
}

export const myschemeImporter: Importer = {
  async list(fetcher: PoliteFetcher, limit = Infinity) {
    const index = await fetcher.text(`${MYSCHEME_BASE}/sitemap.xml`);
    let urls = parseSitemap(index);
    // Sitemap index -> fetch child sitemaps
    const children = urls.filter((u) => u.endsWith(".xml"));
    if (children.length) {
      urls = [];
      for (const c of children) urls.push(...parseSitemap(await fetcher.text(c)));
    }
    return urls.filter((u) => /\/schemes\/[a-z0-9-]+\/?$/i.test(u)).slice(0, limit);
  },
  async fetchScheme(fetcher, url) {
    return parseMySchemePage(await fetcher.text(url), url);
  },
};
