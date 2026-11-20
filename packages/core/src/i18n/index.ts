import type { Check } from "../engine.js";
import type { ProfileField } from "../profile.js";
import type { Scalar } from "../rules.js";
import { stateName } from "../states.js";
import type { Lang } from "./lang.js";
import { en, type Locale } from "./locales/en.js";
import { hi } from "./locales/hi.js";
import { hinglish } from "./locales/hinglish.js";
import { EXTRA_LOCALES } from "./locales/extra.js";

export * from "./lang.js";
export type { Locale } from "./locales/en.js";

const LOCALES: Partial<Record<Lang, Locale>> = { en, hi, hinglish, ...EXTRA_LOCALES };

export function getLocale(lang: Lang): Locale {
  return LOCALES[lang] ?? en;
}

export function fmt(template: string, vars: Record<string, string | number> = {}): string {
  return template.replace(/\{(\w+)\}/g, (_, k: string) => (vars[k] !== undefined ? String(vars[k]) : `{${k}}`));
}

export function formatInr(n: number, lang: Lang): string {
  const L = getLocale(lang);
  if (n >= 100_000) {
    const lakh = n / 100_000;
    const s = Number.isInteger(lakh) ? String(lakh) : lakh.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
    return `₹${s} ${L.lakh}`;
  }
  return "₹" + n.toLocaleString("en-IN");
}

export function formatValue(field: ProfileField, v: Scalar | Scalar[] | undefined, lang: Lang): string {
  const L = getLocale(lang);
  if (v === undefined) return "?";
  if (Array.isArray(v)) return v.map((x) => formatValue(field, x, lang)).join(", ");
  if (typeof v === "boolean") return v ? L.yes : L.no;
  if (field === "annualIncome" && typeof v === "number") return formatInr(v, lang);
  if (field === "age" && typeof v === "number") return `${v} ${L.years}`;
  if (field === "landHoldingHectares" && typeof v === "number") return `${v} ${L.hectare}`;
  if (field === "disabilityPercent" && typeof v === "number") return `${v}%`;
  if (field === "state" && typeof v === "string") return stateName(v, lang === "hi" || lang === "mr" ? "hi" : "en");
  if (typeof v === "string") return L.values[v] ?? v;
  return String(v);
}

export function describeExpectation(c: Check, lang: Lang): string {
  const L = getLocale(lang);
  let s: string;
  if (c.op === "between" && Array.isArray(c.expected)) {
    s = fmt(L.ops.between, {
      min: formatValue(c.field, c.expected[0], lang),
      max: formatValue(c.field, c.expected[1], lang),
    });
  } else if (c.op === "exists") {
    s = L.ops.exists;
  } else {
    s = fmt(L.ops[c.op], { v: formatValue(c.field, c.expected, lang) });
  }
  return c.negated ? fmt(L.ops.not, { x: s }) : s;
}

export type CheckOutcome = "passed" | "failed";

export function describeCheck(c: Check, outcome: CheckOutcome, lang: Lang): string {
  const L = getLocale(lang);
  const vars = {
    label: L.fields[c.field],
    actual: formatValue(c.field, c.actual, lang),
    expect: describeExpectation(c, lang),
  };
  const base = fmt(outcome === "passed" ? L.reasonPassed : L.reasonFailed, vars);
  return c.note ? `${base} — ${c.note}` : base;
}

export function describeMissing(field: ProfileField, lang: Lang): string {
  const L = getLocale(lang);
  return fmt(L.reasonMissing, { label: L.fields[field] });
}
