export const LANGS = ["en", "hi", "hinglish", "gu", "mr", "ta", "te", "bn", "kn"] as const;
export type Lang = (typeof LANGS)[number];

export const LANG_NAMES: Record<Lang, string> = {
  en: "English",
  hi: "हिन्दी",
  hinglish: "Hinglish",
  gu: "ગુજરાતી",
  mr: "मराठी",
  ta: "தமிழ்",
  te: "తెలుగు",
  bn: "বাংলা",
  kn: "ಕನ್ನಡ",
};

/** BCP-47-ish tags used for speech-to-text and HTML lang attributes. */
export const LANG_LOCALE: Record<Lang, string> = {
  en: "en-IN",
  hi: "hi-IN",
  hinglish: "hi-IN",
  gu: "gu-IN",
  mr: "mr-IN",
  ta: "ta-IN",
  te: "te-IN",
  bn: "bn-IN",
  kn: "kn-IN",
};

export function isLang(x: unknown): x is Lang {
  return typeof x === "string" && (LANGS as readonly string[]).includes(x);
}

const SCRIPT_RANGES: Array<[RegExp, Lang]> = [
  [/[઀-૿]/g, "gu"],
  [/[஀-௿]/g, "ta"],
  [/[ఀ-౿]/g, "te"],
  [/[ঀ-৿]/g, "bn"],
  [/[ಀ-೿]/g, "kn"],
  [/[ऀ-ॿ]/g, "hi"],
];

// Words that are common in Marathi but not in Hindi.
const MARATHI_MARKERS = /(आहे|आहेत|माझे|माझी|माझा|मला|आणि|नाही|काय|तुम्ही|वर्षांचा|वर्षांची|शेतकरी|करतो|करते)/;

// Romanised Hindi function words / scheme vocabulary.
const HINGLISH_MARKERS =
  /\b(hai|hain|hu|hoon|mera|meri|mere|mujhe|kya|kaun|kitna|kitni|saal|sal|umar|umr|kisan|kheti|gaon|gaanv|shahar|mahila|aurat|yojana|yojna|paisa|naya|kaise|chahiye|batao|bataiye|nahi|nahin|haan|ji|wala|wali|ke|ki|ka|aur|bhi|se|mein|liye|beti|beta|vidhwa|garib|majdoor|mazdoor|lakh)\b/gi;

/**
 * Detect the user's language from free text. Deterministic and cheap: uses
 * Unicode script ranges, then Marathi / Hinglish marker words.
 */
export function detectLanguage(text: string, fallback: Lang = "en"): Lang {
  const t = text.trim();
  if (!t) return fallback;
  let best: Lang | null = null;
  let bestCount = 0;
  for (const [re, lang] of SCRIPT_RANGES) {
    const n = t.match(re)?.length ?? 0;
    if (n > bestCount) {
      best = lang;
      bestCount = n;
    }
  }
  if (best === "hi") return MARATHI_MARKERS.test(t) ? "mr" : "hi";
  if (best) return best;
  const latinWords = t.match(/[a-z]+/gi)?.length ?? 0;
  if (latinWords === 0) return fallback;
  const hinglish = t.match(HINGLISH_MARKERS)?.length ?? 0;
  if (hinglish >= 2 || (hinglish >= 1 && latinWords <= 3)) return "hinglish";
  return "en";
}
