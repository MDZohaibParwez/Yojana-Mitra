/**
 * Canonical document keys so lists from different schemes (and in different
 * languages) de-duplicate cleanly. The first wording seen is kept for display.
 */
const CANONICAL: Array<[RegExp, string]> = [
  [/aadh?aa?r|आधार/i, "aadhaar"],
  [/ration\s*card|bpl\s*card|antyodaya|राशन/i, "ration_card"],
  [/bank\s*(account|pass\s*book)|passbook|बैंक|पासबुक/i, "bank_passbook"],
  [/income\s*cert|आय\s*प्रमाण/i, "income_certificate"],
  [/caste\s*cert|category\s*cert|जाति\s*प्रमाण/i, "caste_certificate"],
  [/(domicile|residence|niwas)\s*cert|निवास\s*प्रमाण|मूल\s*निवास/i, "domicile_certificate"],
  [/disab|divyang|udid|दिव्यांग/i, "disability_certificate"],
  [/photo|फ़ोटो|फोटो/i, "photo"],
  [/land\s*(record|document|ownership)|khatauni|khasra|7\/12|patta|jamabandi|भूमि|खतौनी/i, "land_records"],
  [/mobile|मोबाइल/i, "mobile"],
  [/age\s*proof|birth\s*cert|जन्म\s*प्रमाण|आयु\s*प्रमाण/i, "age_proof"],
  [/death\s*cert|मृत्यु\s*प्रमाण/i, "death_certificate"],
  [/mark\s*sheet|marksheet|अंकपत्र|मार्कशीट/i, "marksheet"],
  [/fee\s*receipt|शुल्क\s*रसीद|फीस/i, "fee_receipt"],
];

export function documentKey(name: string): string {
  const trimmed = name.trim().replace(/\s+/g, " ");
  for (const [re, key] of CANONICAL) if (re.test(trimmed)) return key;
  return trimmed.toLowerCase();
}

export interface ChecklistItem {
  document: string;
  neededFor: string[];
}

export function mergeDocuments(lists: Array<{ scheme: string; documents: string[] }>): ChecklistItem[] {
  const map = new Map<string, ChecklistItem>();
  for (const { scheme, documents } of lists) {
    for (const d of documents) {
      const key = documentKey(d);
      const item = map.get(key) ?? { document: d.trim(), neededFor: [] };
      if (!item.neededFor.includes(scheme)) item.neededFor.push(scheme);
      map.set(key, item);
    }
  }
  return [...map.values()].sort((a, b) => b.neededFor.length - a.neededFor.length || a.document.localeCompare(b.document));
}
