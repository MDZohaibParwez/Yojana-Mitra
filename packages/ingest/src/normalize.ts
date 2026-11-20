import type { SchemeCategory, SeedScheme } from "@ym/core";
import { cleanText, toList } from "./sources/html.js";
import type { RawScheme } from "./sources/types.js";

const CATEGORY_KEYWORDS: Array<[SchemeCategory, RegExp]> = [
  ["education", /scholar|student|education|school|college|fellowship|छात्रवृत्ति/i],
  ["pension", /pension|पेंशन|old age|maan-?dhan/i],
  ["insurance", /insurance|bima|बीमा/i],
  ["health", /health|hospital|medical|treatment|स्वास्थ्य|ayushman/i],
  ["housing", /housing|house|awas|आवास|shelter/i],
  ["agriculture", /farmer|agricultur|crop|kisan|किसान|irrigation|horticulture|dairy|fisher/i],
  ["disability", /disab|divyang|दिव्यांग|handicap/i],
  ["women_child", /women|girl|mahila|maternity|pregnan|widow|beti|कन्या|महिला/i],
  ["business", /loan|entrepreneur|enterprise|msme|startup|business|vendor/i],
  ["employment", /employment|job|rozgar|wage|unemploy/i],
  ["skill", /skill|training|apprentice|artisan/i],
  ["energy", /solar|lpg|gas|electricity|energy/i],
  ["food", /ration|food|anna|अन्न/i],
  ["banking", /bank account|jan dhan|financial inclusion/i],
];

export function inferCategory(raw: RawScheme): SchemeCategory {
  const hay = `${raw.name} ${raw.tags?.join(" ") ?? ""} ${raw.sections.details ?? ""}`.slice(0, 2000);
  return CATEGORY_KEYWORDS.find(([, re]) => re.test(hay))?.[0] ?? "social_welfare";
}

export function slugify(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^\x00-\x7F]/g, "")
    .replace(/\(.*?\)/g, " ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80) || "scheme";
}

/** Rough annual INR value from the first ₹ amount in the benefits text (ranking only). */
export function estimateBenefitInr(text?: string): number | null {
  if (!text) return null;
  const m = text.match(/(?:₹|rs\.?|inr)\s*([\d,]+(?:\.\d+)?)\s*(lakh|crore)?/i);
  if (!m) return null;
  let n = Number(m[1]!.replace(/,/g, ""));
  if (m[2]?.toLowerCase() === "lakh") n *= 100_000;
  if (m[2]?.toLowerCase() === "crore") n *= 10_000_000;
  return Number.isFinite(n) && n > 0 ? Math.round(n) : null;
}

export type NormalizedScheme = Omit<SeedScheme, "rule">;

export function normalize(raw: RawScheme): NormalizedScheme {
  const s = raw.sections;
  const steps = toList(s.applicationProcess);
  const short = cleanText((s.details ?? s.benefits ?? raw.name).split(/(?<=[.।])\s/)[0] ?? raw.name).slice(0, 400);
  const slug = slugify(raw.slugHint ?? raw.name);
  return {
    slug: raw.level === "state" && raw.stateCode && !slug.startsWith(raw.stateCode.toLowerCase()) ? `${raw.stateCode.toLowerCase()}-${slug}` : slug,
    level: raw.level,
    stateCode: raw.level === "state" ? (raw.stateCode as NormalizedScheme["stateCode"]) : null,
    ministry: raw.ministry?.trim() || "Not specified",
    category: inferCategory(raw),
    tags: (raw.tags ?? []).map((t) => t.toLowerCase().slice(0, 60)).slice(0, 20),
    officialApplyUrl: raw.applyUrl ?? raw.url,
    sourceUrl: raw.url,
    status: "unknown",
    deadline: raw.deadline ?? null,
    benefitValueInr: estimateBenefitInr(s.benefits),
    text: {
      en: {
        name: raw.name.slice(0, 300),
        shortDescription: short.length >= 10 ? short : `${raw.name} – see official source for details.`,
        benefits: (s.benefits ?? "See official source.").slice(0, 3000),
        howToApplySteps: steps.length ? steps.slice(0, 20) : ["Follow the application process on the official link."],
        documentsRequired: toList(s.documents).slice(0, 30),
      },
    },
  };
}
