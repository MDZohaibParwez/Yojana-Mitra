import type { Profile, ProfileField } from "../profile.js";
import { STATES } from "../states.js";

/**
 * Deterministic free-text profile extraction for English, Hindi (Devanagari) and
 * Hinglish. Used by WhatsApp and web chat so those channels need no LLM.
 * It only extracts what is clearly stated; anything ambiguous is left out and asked.
 */

const ACRE_TO_HA = 0.4047;

const HINDI_DIGITS: Record<string, string> = { "०": "0", "१": "1", "२": "2", "३": "3", "४": "4", "५": "5", "६": "6", "७": "7", "८": "8", "९": "9" };
export function normalizeDigits(s: string): string {
  return s.replace(/[०-९]/g, (d) => HINDI_DIGITS[d]!);
}

const FRACTION_WORDS: Array<[RegExp, number]> = [
  [/(डेढ़|डेढ|dedh|derh|dedh)\s*/i, 1.5],
  [/(ढाई|dhai|dhaai)\s*/i, 2.5],
  [/(सवा|sawa|sava)\s*(एक|ek)?\s*/i, 1.25],
];

const w = (words: string[]) => new RegExp(`(^|[^\\p{L}\\p{M}])(${words.join("|")})(?=$|[^\\p{L}\\p{M}])`, "iu");

const GENDER_FEMALE = w(["woman", "women", "female", "lady", "girl", "mahila", "aurat", "ladki", "beti", "widow", "mother", "housewife", "महिला", "औरत", "लड़की", "बेटी", "विधवा", "स्त्री", "गृहिणी", "vidhwa", "grihini"]);
const GENDER_MALE = w(["man", "male", "boy", "purush", "aadmi", "admi", "ladka", "beta", "widower", "पुरुष", "आदमी", "लड़का", "बेटा"]);
const FEMALE_VERB = /(karti|rehti|rahti|padhti|hoti)\s*(hu|hoon|hun|hai)|(करती|रहती|पढ़ती|होती)\s*(हूँ|हूं|है)/i;
const MALE_VERB = /(karta|rehta|rahta|padhta|hota)\s*(hu|hoon|hun|hai)|(करता|रहता|पढ़ता|होता)\s*(हूँ|हूं|है)/i;

const OCCUPATION_RULES: Array<[Profile["occupation"], RegExp]> = [
  ["agricultural_labourer", /(khet|khetihar|farm|agricultural)\s*(mazdoor|majdoor|labour|labourer|worker)|खेतिहर|खेत\s*मज़?दूर/i],
  ["construction_worker", w(["construction", "rajmistri", "raj mistri", "mistri", "mason", "निर्माण", "राजमिस्त्री", "मिस्त्री"])],
  ["street_vendor", w(["vendor", "hawker", "rehri", "rehdi", "thela", "thelewala", "pheriwala", "ठेला", "रेहड़ी", "फेरीवाला", "पटरी"])],
  ["fisherman", w(["fisherman", "fisher", "fishing", "machhuara", "machhua", "मछुआरा", "मछली पालन"])],
  ["artisan", w(["artisan", "karigar", "carpenter", "badhai", "tailor", "darzi", "lohar", "blacksmith", "kumhar", "potter", "barber", "nai", "cobbler", "mochi", "weaver", "bunkar", "goldsmith", "sunar", "कारीगर", "बढ़ई", "दर्ज़ी", "दर्जी", "लोहार", "कुम्हार", "नाई", "मोची", "बुनकर"])],
  ["farmer", w(["farmer", "farming", "kisan", "kisaan", "kheti", "krishak", "किसान", "खेती", "कृषक"])],
  ["student", w(["student", "studying", "chhatra", "chatra", "vidyarthi", "padhai", "college", "school", "छात्र", "छात्रा", "विद्यार्थी", "पढ़ाई"])],
  ["homemaker", w(["homemaker", "housewife", "grihini", "गृहिणी", "हाउसवाइफ"])],
  ["government_employee", /(government|govt|sarkari)\s*(job|employee|naukri|service)|सरकारी\s*(नौकरी|कर्मचारी)/i],
  ["retired", w(["retired", "pensioner", "सेवानिवृत्त", "रिटायर"])],
  ["unemployed", w(["unemployed", "berozgar", "berojgar", "jobless", "बेरोज़गार", "बेरोजगार"])],
  ["business", w(["business", "shop", "dukan", "dukaan", "vyapar", "vyapari", "trader", "दुकान", "व्यापार", "व्यापारी", "बिज़नेस"])],
  ["self_employed", /self[- ]?employed|swarozgar|स्वरोज़गार|स्वरोजगार/i],
  ["unorganised_worker", w(["labour", "labourer", "worker", "mazdoor", "majdoor", "mazdur", "daily wage", "dihadi", "मज़दूर", "मजदूर", "दिहाड़ी", "श्रमिक"])],
  ["organised_worker", /private\s*(job|naukri|company)|prayvet|प्राइवेट\s*नौकरी/i],
];

const MARITAL_RULES: Array<[Profile["maritalStatus"], RegExp]> = [
  ["widowed", w(["widow", "widowed", "widower", "vidhwa", "vidhur", "विधवा", "विधुर"])],
  ["divorced", w(["divorced", "divorcee", "talaq", "talaaq", "talakshuda", "तलाक", "तलाकशुदा"])],
  ["separated", w(["separated", "abandoned", "parityakta", "परित्यक्ता"])],
  ["single", /\b(unmarried|single|avivahit|kunwari|kunvari)\b|अविवाहित|कुंवारी/i],
  ["married", /\b(married|shaadi\s*shuda|shadishuda|vivahit)\b|विवाहित|शादीशुदा/i],
];

const EDUCATION_RULES: Array<[Profile["educationLevel"], RegExp]> = [
  ["postgraduate", /\b(post\s*graduate|postgraduate|pg|m\.?a|m\.?sc|m\.?com|mba|mca|m\.?tech)\b|स्नातकोत्तर/i],
  ["graduate", /\b(graduate|graduation|b\.?a|b\.?sc|b\.?com|b\.?tech|bca|bba|degree)\b|स्नातक|ग्रेजुएट/i],
  ["diploma", /\b(diploma|iti|polytechnic)\b|डिप्लोमा|आईटीआई/i],
  ["higher_secondary", /\b(12th|12 ?(th|vi|vin|wi)|twelfth|inter|intermediate|hsc|plus two)\b|12वीं|बारहवीं|इंटर/i],
  ["secondary", /\b(10th|10 ?(th|vi|vin|wi)|tenth|matric|matriculation|ssc|high school)\b|10वीं|दसवीं|हाई\s*स्कूल|मैट्रिक/i],
  ["primary", /\b([5-8]th|[5-8] ?(vi|vin)|primary|middle school)\b|प्राथमिक|[५-८]वीं|[5-8]वीं/i],
  ["none", /\b(illiterate|anpadh|no schooling|never studied)\b|अनपढ़|निरक्षर/i],
];

const YES = /^(y|yes|yeah|yup|haan|han|ha|haa|hanji|ji|ji haan|sure|ok|okay|हाँ|हां|जी|जी हाँ|हा|ho|hoy|ஆம்|అవును|হ্যাঁ|ಹೌದು|હા)(?=$|[\s,.!])/i;
const NO = /^(n|no|nope|nahi|nahin|nai|na|nahi hai|नहीं|नही|ना|nako|नाही|இல்லை|కాదు|లేదు|না|ಇಲ್ಲ|ના)(?=$|[\s,.!])/i;
const NOT_SURE = /^(not sure|don'?t know|dont know|pata nahi|maloom nahi|पता नहीं|मालूम नहीं|skip)(?=$|[\s,.!])/i;

export function parseYesNo(text: string): boolean | "unsure" | undefined {
  const t = text.trim().toLowerCase();
  if (NOT_SURE.test(t)) return "unsure";
  if (YES.test(t)) return true;
  if (NO.test(t)) return false;
  return undefined;
}

/** Money: "1.5 lakh", "डेढ़ लाख", "150000", "15 hazar mahina", "₹2,50,000". Returns ANNUAL amount. */
export function parseMoney(raw: string): number | undefined {
  let t = normalizeDigits(raw.toLowerCase()).replace(/,/g, "").replace(/₹/g, " ").replace(/rs\.?/g, " ");
  let multiplierFromWord: number | undefined;
  for (const [re, n] of FRACTION_WORDS) {
    if (re.test(t)) {
      multiplierFromWord = n;
      t = t.replace(re, "");
    }
  }
  const monthly = /(per\s*month|monthly|month|mahina|mahine|mahina|महीना|महीने|मासिक|\/\s*m)/i.test(t);
  const m = t.match(/(\d+(?:\.\d+)?)\s*(lakh|lac|lakhs|laakh|लाख|l\b|k\b|thousand|hazar|hajar|हज़ार|हजार|crore|करोड़)?/i);
  let n: number | undefined;
  if (m) {
    n = Number(m[1]);
    const unit = (m[2] ?? "").toLowerCase();
    if (/lakh|lac|laakh|लाख|^l$/.test(unit)) n *= 100_000;
    else if (/k|thousand|hazar|hajar|हज़ार|हजार/.test(unit)) n *= 1000;
    else if (/crore|करोड़/.test(unit)) n *= 10_000_000;
  } else if (multiplierFromWord !== undefined && /lakh|lac|लाख/.test(t)) {
    n = multiplierFromWord * 100_000;
  }
  if (n === undefined || !Number.isFinite(n)) return undefined;
  if (monthly) n *= 12;
  return Math.round(n);
}

export function parseLandHectares(raw: string): number | undefined {
  const t = normalizeDigits(raw.toLowerCase());
  if (/\b(no land|landless|bhoomihin|zameen nahi)\b|भूमिहीन|ज़मीन नहीं|जमीन नहीं/.test(t)) return 0;
  const m = t.match(/(\d+(?:\.\d+)?)\s*(acre|acres|ekad|ekar|एकड़|hectare|hectares|ha|हेक्टेयर)?/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  const unit = m[2] ?? "";
  if (/hect|^ha$|हेक्टेयर/.test(unit)) return n;
  // Acres are the default unit people use when no unit is given in chat answers.
  return Math.round(n * ACRE_TO_HA * 100) / 100;
}

export function parseState(raw: string): string | undefined {
  const t = raw.toLowerCase();
  // longest names first so "west bengal" wins over "bengal", "arunachal pradesh" over "pradesh"
  const candidates = STATES.flatMap((s) => [s.en, s.hi, ...s.aliases].map((n) => ({ code: s.code, n: n.toLowerCase() }))).sort(
    (a, b) => b.n.length - a.n.length,
  );
  for (const c of candidates) {
    if (c.n.length <= 2) {
      // short aliases (up, mp, uk, cg) only as whole words
      if (new RegExp(`(^|\\s)${c.n}(\\s|$|[,.])`, "i").test(t)) return c.code;
      continue;
    }
    if (t.includes(c.n)) return c.code;
  }
  const code = raw.trim().toUpperCase();
  return STATES.some((s) => s.code === code) ? code : undefined;
}

function parseAge(t: string): number | undefined {
  const m =
    t.match(/(\d{1,3})\s*(?:-\s*)?(saal|sal|saal ka|saal ki|years?|yrs?|yr|y\/o|वर्ष|साल|बरस)/i) ??
    t.match(/(?:age|umar|umr|aayu|उम्र|आयु)\s*(?:is|hai|:|-)?\s*(\d{1,3})/i);
  if (!m) return undefined;
  const n = Number(m[1]);
  return n >= 0 && n <= 120 ? n : undefined;
}

/** Extract every profile fact clearly stated in free text. */
export function parseProfileFromText(input: string): Profile {
  const t = normalizeDigits(input);
  const p: Profile = {};

  const age = parseAge(t);
  if (age !== undefined) p.age = age;

  const kw = t.match(/(income|aay|aamdani|kamai|salary|kamata|kamati|आय|आमदनी|कमाई|इनकम|वेतन)/i);
  const lakhAnywhere = t.match(/((?:डेढ़|डेढ|ढाई|सवा|dedh|derh|dhai|sawa)\s*(?:lakh|lac|लाख)|\d+(?:\.\d+)?\s*(?:lakh|lac|लाख))(?:\s*(?:per month|monthly|mahina|महीना|मासिक))?/i);
  const window = kw ? t.slice(kw.index! + kw[0].length, kw.index! + kw[0].length + 45) : null;
  const money = (window && /\d|डेढ़|डेढ|ढाई|सवा|dedh|derh|dhai|sawa/i.test(window) ? parseMoney(window.split(/[,;]|\band\b|और/)[0]!) : undefined) ??
    (lakhAnywhere ? parseMoney(lakhAnywhere[0]) : undefined);
  if (money !== undefined && money > 0) p.annualIncome = money;

  const state = parseState(t);
  if (state) p.state = state as Profile["state"];

  if (GENDER_FEMALE.test(t) || FEMALE_VERB.test(t)) p.gender = "female";
  else if (GENDER_MALE.test(t) || MALE_VERB.test(t)) p.gender = "male";
  if (/\b(transgender|kinnar|hijra)\b|ट्रांसजेंडर|किन्नर/i.test(t)) p.gender = "transgender";

  for (const [occ, re] of OCCUPATION_RULES) {
    if (re.test(t)) {
      p.occupation = occ;
      break;
    }
  }

  if (/\b(ST|scheduled tribe|adivasi|tribal)\b|अनुसूचित\s*जनजाति|आदिवासी|जनजाति/.test(t)) p.socialCategory = "ST";
  else if (/\b(SC|scheduled caste|dalit)\b|अनुसूचित\s*जाति|दलित/.test(t)) p.socialCategory = "SC";
  else if (/\b(OBC|backward class|pichda)\b|पिछड़ा|ओबीसी/i.test(t)) p.socialCategory = "OBC";
  else if (/\bEWS\b|ईडब्ल्यूएस/.test(t)) p.socialCategory = "EWS";
  else if (/\b(general|gen|unreserved)\s*(category|cast|caste)?\b|सामान्य\s*(वर्ग|श्रेणी)/i.test(t)) p.socialCategory = "General";

  if (/\b(muslim|christian|sikh|buddhist|jain|parsi|minority)\b|मुस्लिम|ईसाई|सिख|बौद्ध|जैन|पारसी|अल्पसंख्यक/i.test(t)) p.isMinority = true;

  if (/\b(village|gaon|gaanv|gaav|gram|rural|gramin|dehat)\b|गाँव|गांव|ग्राम|ग्रामीण|देहात/i.test(t)) p.area = "rural";
  else if (/\b(city|shahar|sheher|town|urban|kasba|nagar|metro)\b|शहर|कस्बा|नगर|शहरी/i.test(t)) p.area = "urban";

  for (const [ms, re] of MARITAL_RULES) {
    if (re.test(t)) {
      p.maritalStatus = ms;
      break;
    }
  }
  if (p.maritalStatus === "widowed" && !p.gender && /vidhwa|विधवा|\bwidow\b/i.test(t)) p.gender = "female";

  if (/\b(no disability|not disabled)\b|दिव्यांग\s*नहीं|विकलांग\s*नहीं/i.test(t)) p.hasDisability = false;
  else if (/\b(divyang|viklang|disabled|disability|handicapped|blind|deaf|wheelchair)\b|दिव्यांग|विकलांग|अंधा|बहरा/i.test(t)) {
    p.hasDisability = true;
    const pct = t.match(/(\d{2,3})\s*(%|percent|pratishat|प्रतिशत)/i);
    if (pct) p.disabilityPercent = Math.min(100, Number(pct[1]));
  }

  if (/\b(no|not|nahi|without)\s*(bpl|ration card)|bpl\s*(nahi|nahin|no)|बीपीएल\s*नहीं/i.test(t)) p.hasBplCard = false;
  else if (/\b(bpl|antyodaya|aay card|below poverty)\b|बीपीएल|अंत्योदय|गरीबी\s*रेखा/i.test(t)) p.hasBplCard = true;

  const land = t.match(/(\d+(?:\.\d+)?\s*(?:acre|acres|ekad|ekar|एकड़|hectare|hectares|ha\b|हेक्टेयर))|(?:no land|landless|bhoomihin|भूमिहीन)/i);
  if (land) {
    const ha = parseLandHectares(land[0]);
    if (ha !== undefined) p.landHoldingHectares = ha;
  }

  if (/\b(pregnant|garbhvati|garbhwati|expecting)\b|गर्भवती/i.test(t)) p.isPregnantOrLactating = true;

  if (/(no|not|nahi|nahin|don'?t pay)\s*(income)?\s*tax|tax\s*(nahi|nahin)|टैक्स\s*नहीं/i.test(t)) p.isIncomeTaxPayer = false;
  else if (/(pay|bharta|bharte|bharti)\s*(income)?\s*tax|income\s*tax\s*(payer|bharta|bharte)|आयकर\s*(दाता|भरता)/i.test(t)) p.isIncomeTaxPayer = true;

  if (/(kachcha|kaccha|kacha|kutcha)\s*(ghar|makan|house)|no\s*(pucca\s*)?house|ghar\s*nahi|कच्चा\s*(घर|मकान)|बेघर|homeless/i.test(t)) p.hasPuccaHouse = false;
  else if (/(pakka|pucca|pukka)\s*(ghar|makan|house)|पक्का\s*(घर|मकान)/i.test(t)) p.hasPuccaHouse = true;

  for (const [ed, re] of EDUCATION_RULES) {
    if (re.test(t)) {
      p.educationLevel = ed;
      break;
    }
  }
  return p;
}

/** Parse an answer to a specific question. Returns undefined if not understood, "unsure" for "don't know". */
export function parseAnswer(field: ProfileField, text: string): Profile[ProfileField] | "unsure" | undefined {
  const t = normalizeDigits(text.trim());
  if (NOT_SURE.test(t.toLowerCase())) return "unsure";
  switch (field) {
    case "age": {
      const n = parseAge(t) ?? (t.match(/^\s*(\d{1,3})\s*$/) ? Number(t) : undefined);
      return n !== undefined && n <= 120 ? n : undefined;
    }
    case "annualIncome":
      return /^(0|zero|nothing|kuch nahi|कुछ नहीं)$/i.test(t) ? 0 : parseMoney(t);
    case "landHoldingHectares":
      return /^(0|zero|none|no|nahi|नहीं)$/i.test(t) ? 0 : parseLandHectares(t);
    case "disabilityPercent": {
      const m = t.match(/(\d{1,3})/);
      return m ? Math.min(100, Number(m[1])) : undefined;
    }
    case "state":
      return parseState(t) as Profile["state"];
    case "district":
      return t.length >= 2 && t.length <= 60 && !/\d{4,}/.test(t) ? t : undefined;
    case "isMinority":
    case "hasDisability":
    case "hasBplCard":
    case "isIncomeTaxPayer":
    case "isPregnantOrLactating":
    case "hasPuccaHouse": {
      const yn = parseYesNo(t);
      return yn === undefined ? (parseProfileFromText(t)[field] as boolean | undefined) : yn;
    }
    default:
      return parseProfileFromText(t)[field];
  }
}
