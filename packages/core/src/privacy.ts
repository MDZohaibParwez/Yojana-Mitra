/**
 * Detects identifiers we must never collect: Aadhaar, PAN, bank account / IFSC,
 * card numbers, OTPs and passwords. Channels reject input containing them,
 * and `redact` is applied before anything is written to logs or the reports table.
 */
export type SensitiveKind = "aadhaar" | "pan" | "ifsc" | "bank_account" | "card" | "otp_or_password" | "voter_id";

// Verhoeff tables for Aadhaar checksum.
const D = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 2, 3, 4, 0, 6, 7, 8, 9, 5],
  [2, 3, 4, 0, 1, 7, 8, 9, 5, 6],
  [3, 4, 0, 1, 2, 8, 9, 5, 6, 7],
  [4, 0, 1, 2, 3, 9, 5, 6, 7, 8],
  [5, 9, 8, 7, 6, 0, 4, 3, 2, 1],
  [6, 5, 9, 8, 7, 1, 0, 4, 3, 2],
  [7, 6, 5, 9, 8, 2, 1, 0, 4, 3],
  [8, 7, 6, 5, 9, 3, 2, 1, 0, 4],
  [9, 8, 7, 6, 5, 4, 3, 2, 1, 0],
];
const P = [
  [0, 1, 2, 3, 4, 5, 6, 7, 8, 9],
  [1, 5, 7, 6, 2, 8, 3, 0, 9, 4],
  [5, 8, 0, 3, 7, 9, 6, 1, 4, 2],
  [8, 9, 1, 6, 0, 4, 3, 5, 2, 7],
  [9, 4, 5, 3, 1, 2, 6, 8, 7, 0],
  [4, 2, 8, 6, 5, 7, 3, 9, 0, 1],
  [2, 7, 9, 3, 8, 0, 6, 4, 1, 5],
  [7, 0, 4, 6, 9, 1, 3, 2, 5, 8],
];

export function verhoeffValid(num: string): boolean {
  let c = 0;
  const digits = num.split("").reverse().map(Number);
  for (let i = 0; i < digits.length; i++) c = D[c]![P[i % 8]![digits[i]!]!]!;
  return c === 0;
}

export function luhnValid(num: string): boolean {
  let sum = 0;
  let alt = false;
  for (let i = num.length - 1; i >= 0; i--) {
    let n = Number(num[i]);
    if (alt) {
      n *= 2;
      if (n > 9) n -= 9;
    }
    sum += n;
    alt = !alt;
  }
  return sum % 10 === 0;
}

const DIGIT_RUN = /(?<!\d)(?:\d[ -]?){8,18}\d(?!\d)/g;
const PAN = /\b[A-Z]{3}[ABCFGHLJPT][A-Z]\d{4}[A-Z]\b/i;
const IFSC = /\b[A-Z]{4}0[A-Z0-9]{6}\b/i;
const VOTER_ID = /\b[A-Z]{3}\d{7}\b/i;
const SECRET_KEYWORD =
  /\b(otp|password|passcode|pass\s*word|pin|cvv|mpin|upi\s*pin)\b\s*(is|hai|:|=|-)?\s*\S+|(ओटीपी|पासवर्ड|पिन)\s*\S+/i;
const BANK_KEYWORD = /\b(account|a\/c|acct|khata|khaata|bank)\b|खाता|बैंक/i;
const AADHAAR_KEYWORD = /\b(aadhaar|aadhar|adhar|uid)\b|आधार/i;

export interface SensitiveFinding {
  kind: SensitiveKind;
}

export function findSensitive(text: string): SensitiveFinding[] {
  const out: SensitiveFinding[] = [];
  const add = (kind: SensitiveKind) => {
    if (!out.some((f) => f.kind === kind)) out.push({ kind });
  };
  if (PAN.test(text)) add("pan");
  if (IFSC.test(text)) add("ifsc");
  if (VOTER_ID.test(text)) add("voter_id");
  if (SECRET_KEYWORD.test(text)) add("otp_or_password");
  for (const m of text.matchAll(DIGIT_RUN)) {
    const digits = m[0].replace(/[ -]/g, "");
    if (digits.length === 12 && /^[2-9]/.test(digits) && (verhoeffValid(digits) || AADHAAR_KEYWORD.test(text))) {
      add("aadhaar");
    } else if (digits.length >= 13 && digits.length <= 19 && luhnValid(digits)) {
      add("card");
    } else if (digits.length >= 9 && digits.length <= 18 && BANK_KEYWORD.test(text)) {
      add("bank_account");
    }
  }
  if (AADHAAR_KEYWORD.test(text) && /\d{4}[ -]?\d{4}[ -]?\d{4}/.test(text)) add("aadhaar");
  return out;
}

export function containsSensitive(text: string): boolean {
  return findSensitive(text).length > 0;
}

const PHONE = /(?<!\d)(?:\+?91[ -]?)?[6-9]\d{4}[ -]?\d{5}(?!\d)/g;
const EMAIL = /[\w.+-]+@[\w-]+\.[\w.-]+/g;

/** Redact identifiers (incl. phone numbers and emails) before storing or logging free text. */
export function redact(text: string): string {
  return text
    .replace(EMAIL, "[email]")
    .replace(new RegExp(PAN.source, "gi"), "[id]")
    .replace(new RegExp(IFSC.source, "gi"), "[id]")
    .replace(DIGIT_RUN, (m) => (m.replace(/[ -]/g, "").length >= 9 ? "[number]" : m))
    .replace(PHONE, "[phone]")
    .replace(new RegExp(SECRET_KEYWORD.source, "gi"), "[secret]");
}

export class SensitiveDataError extends Error {
  constructor(public kinds: SensitiveKind[]) {
    super(
      `Input looks like it contains sensitive personal identifiers (${kinds.join(", ")}). ` +
        "Yojana Mitra never accepts Aadhaar, PAN, bank, card, OTP or password data. Remove it and try again.",
    );
    this.name = "SensitiveDataError";
  }
}

/** Throws SensitiveDataError if any string inside `value` contains sensitive identifiers. */
export function assertNoSensitive(value: unknown): void {
  const kinds = new Set<SensitiveKind>();
  const visit = (v: unknown) => {
    if (typeof v === "string") findSensitive(v).forEach((f) => kinds.add(f.kind));
    else if (Array.isArray(v)) v.forEach(visit);
    else if (v && typeof v === "object") Object.values(v).forEach(visit);
  };
  visit(value);
  if (kinds.size) throw new SensitiveDataError([...kinds]);
}
