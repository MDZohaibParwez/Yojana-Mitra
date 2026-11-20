import { EDUCATION_LEVELS, GENDERS, getLocale, MARITAL_STATUSES, OCCUPATIONS, SOCIAL_CATEGORIES, STATES, type Lang } from "@ym/core";
import type { FormConfig } from "@/components/profile-form";
import { t } from "./strings";

export function formConfig(lang: Lang): FormConfig {
  const L = getLocale(lang);
  const opts = (vals: readonly string[]) => vals.map((v) => ({ value: v, label: L.values[v] ?? v }));
  return {
    lang,
    s: t(lang),
    labels: L.fields,
    questions: L.questions,
    yes: L.yes,
    no: L.no,
    options: {
      state: STATES.map((s) => ({ value: s.code, label: lang === "hi" || lang === "mr" ? s.hi : s.en })),
      gender: opts(GENDERS),
      occupation: opts(OCCUPATIONS),
      socialCategory: opts(SOCIAL_CATEGORIES),
      area: opts(["rural", "urban"]),
      maritalStatus: opts(MARITAL_STATUSES),
      educationLevel: opts(EDUCATION_LEVELS),
    },
  };
}
