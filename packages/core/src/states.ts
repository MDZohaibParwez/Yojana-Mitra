/** All 28 States and 8 Union Territories, keyed by ISO 3166-2:IN suffix. */
export const STATES = [
  { code: "AP", en: "Andhra Pradesh", hi: "आंध्र प्रदेश", type: "state", aliases: ["andhra"] },
  { code: "AR", en: "Arunachal Pradesh", hi: "अरुणाचल प्रदेश", type: "state", aliases: ["arunachal"] },
  { code: "AS", en: "Assam", hi: "असम", type: "state", aliases: [] },
  { code: "BR", en: "Bihar", hi: "बिहार", type: "state", aliases: [] },
  { code: "CT", en: "Chhattisgarh", hi: "छत्तीसगढ़", type: "state", aliases: ["chattisgarh", "chhatisgarh", "cg"] },
  { code: "GA", en: "Goa", hi: "गोवा", type: "state", aliases: [] },
  { code: "GJ", en: "Gujarat", hi: "गुजरात", type: "state", aliases: ["gujrat", "ગુજરાત"] },
  { code: "HR", en: "Haryana", hi: "हरियाणा", type: "state", aliases: [] },
  { code: "HP", en: "Himachal Pradesh", hi: "हिमाचल प्रदेश", type: "state", aliases: ["himachal"] },
  { code: "JH", en: "Jharkhand", hi: "झारखंड", type: "state", aliases: [] },
  { code: "KA", en: "Karnataka", hi: "कर्नाटक", type: "state", aliases: ["ಕರ್ನಾಟಕ"] },
  { code: "KL", en: "Kerala", hi: "केरल", type: "state", aliases: [] },
  { code: "MP", en: "Madhya Pradesh", hi: "मध्य प्रदेश", type: "state", aliases: ["mp"] },
  { code: "MH", en: "Maharashtra", hi: "महाराष्ट्र", type: "state", aliases: ["महाराष्ट्र"] },
  { code: "MN", en: "Manipur", hi: "मणिपुर", type: "state", aliases: [] },
  { code: "ML", en: "Meghalaya", hi: "मेघालय", type: "state", aliases: [] },
  { code: "MZ", en: "Mizoram", hi: "मिज़ोरम", type: "state", aliases: [] },
  { code: "NL", en: "Nagaland", hi: "नागालैंड", type: "state", aliases: [] },
  { code: "OR", en: "Odisha", hi: "ओडिशा", type: "state", aliases: ["orissa"] },
  { code: "PB", en: "Punjab", hi: "पंजाब", type: "state", aliases: [] },
  { code: "RJ", en: "Rajasthan", hi: "राजस्थान", type: "state", aliases: [] },
  { code: "SK", en: "Sikkim", hi: "सिक्किम", type: "state", aliases: [] },
  { code: "TN", en: "Tamil Nadu", hi: "तमिलनाडु", type: "state", aliases: ["tamilnadu", "தமிழ்நாடு"] },
  { code: "TG", en: "Telangana", hi: "तेलंगाना", type: "state", aliases: ["తెలంగాణ"] },
  { code: "TR", en: "Tripura", hi: "त्रिपुरा", type: "state", aliases: [] },
  { code: "UP", en: "Uttar Pradesh", hi: "उत्तर प्रदेश", type: "state", aliases: ["up"] },
  { code: "UT", en: "Uttarakhand", hi: "उत्तराखंड", type: "state", aliases: ["uttaranchal", "uk"] },
  { code: "WB", en: "West Bengal", hi: "पश्चिम बंगाल", type: "state", aliases: ["bengal", "পশ্চিমবঙ্গ"] },
  { code: "AN", en: "Andaman and Nicobar Islands", hi: "अंडमान और निकोबार द्वीपसमूह", type: "ut", aliases: ["andaman"] },
  { code: "CH", en: "Chandigarh", hi: "चंडीगढ़", type: "ut", aliases: [] },
  { code: "DH", en: "Dadra and Nagar Haveli and Daman and Diu", hi: "दादरा और नगर हवेली और दमन और दीव", type: "ut", aliases: ["daman", "diu", "dadra"] },
  { code: "DL", en: "Delhi", hi: "दिल्ली", type: "ut", aliases: ["new delhi", "nct"] },
  { code: "JK", en: "Jammu and Kashmir", hi: "जम्मू और कश्मीर", type: "ut", aliases: ["jammu", "kashmir", "j&k"] },
  { code: "LA", en: "Ladakh", hi: "लद्दाख", type: "ut", aliases: [] },
  { code: "LD", en: "Lakshadweep", hi: "लक्षद्वीप", type: "ut", aliases: [] },
  { code: "PY", en: "Puducherry", hi: "पुडुचेरी", type: "ut", aliases: ["pondicherry"] },
] as const;

export type StateCode = (typeof STATES)[number]["code"];
export const STATE_CODES = STATES.map((s) => s.code) as unknown as readonly [StateCode, ...StateCode[]];

export function stateName(code: string, lang: string = "en"): string {
  const s = STATES.find((x) => x.code === code);
  if (!s) return code;
  return lang === "hi" ? s.hi : s.en;
}

export function isStateCode(code: string): code is StateCode {
  return STATES.some((s) => s.code === code);
}
