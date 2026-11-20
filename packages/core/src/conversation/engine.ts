import { detectLanguage, fmt, formatInr, getLocale, type Lang } from "../i18n/index.js";
import { findSensitive } from "../privacy.js";
import {
  DEFAULT_QUESTION_ORDER,
  EDUCATION_LEVELS,
  GENDERS,
  MARITAL_STATUSES,
  ProfileSchema,
  SOCIAL_CATEGORIES,
  type Profile,
  type ProfileField,
} from "../profile.js";
import type { Channel, SchemeRepository } from "../repository.js";
import { documentChecklist, findSchemes, upcomingDeadlines } from "../tools.js";
import { parseAnswer, parseProfileFromText } from "./parse.js";

export interface ConversationState {
  v: 1;
  lang: Lang;
  /** Language was chosen explicitly (button/command) — don't auto-switch. */
  langLocked?: boolean;
  profile: Profile;
  pendingField?: ProfileField;
  skipped: ProfileField[];
  questionsAsked: number;
  resultPage: number;
  /** Recently processed inbound message ids (dedupe WhatsApp redeliveries). */
  seen: string[];
}

export interface Button {
  id: string;
  title: string; // ≤ 20 chars for WhatsApp reply buttons
}
export interface ListRow {
  id: string;
  title: string; // ≤ 24 chars
  description?: string;
}
export interface OutMessage {
  text: string;
  buttons?: Button[]; // ≤ 3
  list?: { button: string; rows: ListRow[] }; // ≤ 10 rows
}

export interface Inbound {
  text?: string;
  /** Interactive reply id, e.g. "a:gender:female", "cmd:new". */
  replyId?: string;
  messageId?: string;
}

export interface ConversationContext {
  repo: SchemeRepository;
  channel: Channel;
  now?: Date;
  /** Max results shown per page. */
  pageSize?: number;
}

export const MAX_QUESTIONS = 8;

export function newState(lang: Lang = "hi"): ConversationState {
  return { v: 1, lang, profile: {}, skipped: [], questionsAsked: 0, resultPage: 0, seen: [] };
}

const COMMANDS: Array<[string, RegExp]> = [
  ["new", /^(naya check|naya|nayi|new|new check|restart|reset|start|start again|shuru|नया|नया चेक|फिर से|hi|hello|hey|namaste|namaskar|नमस्ते)$/i],
  ["documents", /^(documents?|docs?|dastavej|dastavez|kagaz|kagzat|दस्तावेज़|दस्तावेज|कागज़)$/i],
  ["deadline", /^(deadlines?|last date|antim tithi|अंतिम तिथि|डेडलाइन)$/i],
  ["help", /^(help|madad|sahayata|menu|\?|मदद|सहायता)$/i],
  ["more", /^(more|aur|aage|next|और|आगे)$/i],
  ["results", /^(results?|show|dikhao|batao|natija|परिणाम|दिखाओ|बताओ)$/i],
];

const LANG_COMMAND = /^(english|hindi|hinglish|हिंदी|हिन्दी|gujarati|ગુજરાતી|marathi|मराठी|tamil|தமிழ்|telugu|తెలుగు|bengali|bangla|বাংলা|kannada|ಕನ್ನಡ)$/i;
const LANG_FROM_WORD: Record<string, Lang> = {
  english: "en", hindi: "hi", "हिंदी": "hi", "हिन्दी": "hi", hinglish: "hinglish", gujarati: "gu", "ગુજરાતી": "gu", marathi: "mr", "मराठी": "mr",
  tamil: "ta", "தமிழ்": "ta", telugu: "te", "తెలుగు": "te", bengali: "bn", bangla: "bn", "বাংলা": "bn", kannada: "kn", "ಕನ್ನಡ": "kn",
};

/** Occupations offered in the WhatsApp list (max 10 rows); others can be typed. */
const OCCUPATION_CHOICES = [
  "farmer",
  "agricultural_labourer",
  "unorganised_worker",
  "construction_worker",
  "student",
  "homemaker",
  "street_vendor",
  "artisan",
  "business",
  "unemployed",
] as const;

const BOOLEAN_FIELDS: ProfileField[] = ["isMinority", "hasDisability", "hasBplCard", "isIncomeTaxPayer", "isPregnantOrLactating", "hasPuccaHouse"];

function trunc(s: string, n: number) {
  return s.length <= n ? s : s.slice(0, n - 1) + "…";
}

export function questionFor(field: ProfileField, lang: Lang): OutMessage {
  const L = getLocale(lang);
  const q = L.questions[field];
  const opt = (v: string): Button => ({ id: `a:${field}:${v}`, title: trunc(L.values[v] ?? v, 20) });
  if (BOOLEAN_FIELDS.includes(field)) {
    return { text: q, buttons: [{ id: `a:${field}:true`, title: L.yes }, { id: `a:${field}:false`, title: L.no }, { id: `a:${field}:unsure`, title: trunc(L.notSure, 20) }] };
  }
  switch (field) {
    case "gender":
      return { text: q, buttons: GENDERS.map(opt) };
    case "area":
      return { text: q, buttons: ["rural", "urban"].map(opt) };
    case "socialCategory":
      return { text: q, list: { button: L.fields.socialCategory, rows: SOCIAL_CATEGORIES.map((v) => ({ id: `a:${field}:${v}`, title: trunc(L.values[v] ?? v, 24) })) } };
    case "maritalStatus":
      return { text: q, list: { button: L.fields.maritalStatus, rows: MARITAL_STATUSES.map((v) => ({ id: `a:${field}:${v}`, title: trunc(L.values[v] ?? v, 24) })) } };
    case "educationLevel":
      return { text: q, list: { button: L.fields.educationLevel, rows: EDUCATION_LEVELS.map((v) => ({ id: `a:${field}:${v}`, title: trunc(L.values[v] ?? v, 24) })) } };
    case "occupation":
      return { text: q, list: { button: L.fields.occupation, rows: OCCUPATION_CHOICES.map((v) => ({ id: `a:${field}:${v}`, title: trunc(L.values[v] ?? v, 24) })) } };
    default:
      return { text: q };
  }
}

function coerceButtonValue(field: ProfileField, raw: string): unknown {
  if (raw === "unsure") return "unsure";
  if (raw === "true") return true;
  if (raw === "false") return false;
  if (field === "age" || field === "annualIncome" || field === "landHoldingHectares" || field === "disabilityPercent") return Number(raw);
  return raw;
}

/** Merge new facts into the profile, validating each field independently. */
function mergeProfile(base: Profile, add: Partial<Record<ProfileField, unknown>>): Profile {
  const out: Record<string, unknown> = { ...base };
  for (const [k, v] of Object.entries(add)) {
    if (v === undefined) continue;
    const r = ProfileSchema.safeParse({ [k]: v });
    if (r.success) out[k] = (r.data as Record<string, unknown>)[k];
  }
  return out as Profile;
}

function menuButtons(lang: Lang): Button[] {
  const L = getLocale(lang);
  return [
    { id: "cmd:documents", title: trunc(L.documents, 20) },
    { id: "cmd:deadline", title: trunc(L.deadline, 20) },
    { id: "cmd:new", title: "naya check" },
  ];
}

async function resultsMessages(state: ConversationState, ctx: ConversationContext): Promise<OutMessage[]> {
  const L = getLocale(state.lang);
  const pageSize = ctx.pageSize ?? 5;
  const r = await findSchemes({ repo: ctx.repo, channel: ctx.channel, now: ctx.now }, { profile: state.profile, lang: state.lang, limit: 50 });
  const confirmed = r.results.filter((x) => x.eligible === true);
  const out: OutMessage[] = [];
  if (!confirmed.length) {
    out.push({ text: L.noResults });
  } else {
    const start = state.resultPage * pageSize;
    const page = confirmed.slice(start, start + pageSize);
    const cards = await Promise.all(
      page.map(async (s, i) => {
        // Pull documents for the card (cheap: same repo, single scheme)
        const docs = await documentChecklist({ repo: ctx.repo, channel: ctx.channel }, { schemeIds: [s.id], lang: state.lang }).catch(() => null);
        const docList = docs?.documents.slice(0, 4).map((d) => d.document).join(", ");
        return [
          `*${start + i + 1}. ${s.name}*`,
          `✅ ${L.fitsBecause}: ${s.reason}`,
          docList ? `📄 ${L.documents}: ${docList}` : null,
          `🔗 ${L.officialLink}: ${s.officialApplyUrl}`,
          `ℹ️ ${L.source}: ${s.sourceUrl} · ${L.lastVerified}: ${s.lastVerifiedAt}`,
        ]
          .filter(Boolean)
          .join("\n");
      }),
    );
    const header = state.resultPage === 0 ? fmt(L.resultsHeader, { n: confirmed.length }) + "\n\n" : "";
    const remaining = confirmed.length - (start + page.length);
    const footer = remaining > 0 ? `\n\n${fmt(L.moreResults, { n: remaining })}` : "";
    out.push({ text: header + cards.join("\n\n") + footer });
  }
  const askable = r.askNext.filter((a) => !state.skipped.includes(a.field));
  const tail = `${r.totalMaybe && askable.length ? fmt(L.maybeHeader, { n: r.totalMaybe }) + "\n" : ""}_${L.disclaimer} ${L.freeServiceNote}_`;
  out.push({ text: tail, buttons: menuButtons(state.lang) });
  return out;
}

function nextQuestion(state: ConversationState, askNext: ProfileField[]): ProfileField | undefined {
  const candidates = askNext.filter((f) => !state.skipped.includes(f) && state.profile[f] === undefined);
  if (candidates.length) return candidates[0];
  return undefined;
}

/**
 * Pure-ish conversation step: (state, inbound) -> (new state, outbound messages).
 * The only side effects are repository reads and anonymous usage counters.
 */
export async function handleMessage(
  prev: ConversationState,
  inbound: Inbound,
  ctx: ConversationContext,
): Promise<{ state: ConversationState; messages: OutMessage[] }> {
  let state: ConversationState = { ...prev, profile: { ...prev.profile }, skipped: [...prev.skipped], seen: [...prev.seen] };
  if (inbound.messageId) {
    if (state.seen.includes(inbound.messageId)) return { state: prev, messages: [] };
    state.seen = [...state.seen.slice(-19), inbound.messageId];
  }
  const text = (inbound.text ?? "").trim().slice(0, 1000);
  const reply = inbound.replyId ?? "";
  if (!text && !reply) return { state: prev, messages: [] };

  // 1) Never accept identifiers. Nothing from this message is stored.
  if (text && findSensitive(text).length) {
    return { state, messages: [{ text: getLocale(state.lang).sensitiveRejected }] };
  }

  // 2) Language: explicit command, or auto-detect from free text unless locked.
  if (LANG_COMMAND.test(text)) {
    state.lang = LANG_FROM_WORD[text.toLowerCase()] ?? state.lang;
    state.langLocked = true;
    const L = getLocale(state.lang);
    const q = state.pendingField ? [questionFor(state.pendingField, state.lang)] : [];
    return { state, messages: [{ text: L.greeting }, ...q] };
  }
  if (text && !state.langLocked && /\p{L}{2,}/u.test(text) && !/^\d/.test(text)) {
    const detected = detectLanguage(text, state.lang);
    // Short Latin answers ("yes", "male") must not flip a Hindi user to English.
    if (detected !== "en" || text.split(/\s+/).length >= 4) state.lang = detected;
  }
  const L = getLocale(state.lang);

  // 3) Commands.
  const cmd = reply.startsWith("cmd:") ? reply.slice(4) : COMMANDS.find(([, re]) => re.test(text))?.[0];
  if (cmd === "new") {
    const fresh = { ...newState(state.lang), langLocked: state.langLocked, seen: state.seen };
    const first = questionFor(DEFAULT_QUESTION_ORDER[0]!, fresh.lang);
    fresh.pendingField = DEFAULT_QUESTION_ORDER[0];
    fresh.questionsAsked = 1;
    return { state: fresh, messages: [{ text: `${prev.questionsAsked ? L.newCheck + "\n\n" : ""}${L.greeting}\n\n_${L.freeServiceNote}_` }, first] };
  }
  if (cmd === "help") return { state, messages: [{ text: `${L.help}\n\n_${L.disclaimer}_`, buttons: menuButtons(state.lang) }] };
  if (cmd === "deadline") {
    const d = await upcomingDeadlines({ repo: ctx.repo, channel: ctx.channel, now: ctx.now }, { state: state.profile.state, days: 30, lang: state.lang });
    const lines = d.results.slice(0, 8).map((s) => `• *${s.name}* — ${s.deadline} (${s.daysLeft}d)\n  🔗 ${s.officialApplyUrl}`);
    return { state, messages: [{ text: [d.header, ...lines].join("\n") }] };
  }
  if (cmd === "documents") {
    const d = await documentChecklist({ repo: ctx.repo, channel: ctx.channel }, { profile: state.profile, lang: state.lang });
    if (!d.schemes.length) return { state, messages: [{ text: L.noResults }] };
    const lines = d.documents.slice(0, 15).map((x) => `• ${x.document} (${x.neededFor.length})`);
    return { state, messages: [{ text: [L.documentsHeader, ...lines, "", `_${d.note}_`].join("\n") }] };
  }
  if (cmd === "more") {
    state.resultPage += 1;
    return { state, messages: await resultsMessages(state, ctx) };
  }
  if (cmd === "results") {
    state.resultPage = 0;
    state.pendingField = undefined;
    return { state, messages: await resultsMessages(state, ctx) };
  }

  // 4) Answers: interactive reply, answer to the pending question, and any extra facts in free text.
  let understood = false;
  const m = reply.match(/^a:(\w+):(.+)$/);
  if (m) {
    const field = m[1] as ProfileField;
    const value = coerceButtonValue(field, m[2]!);
    if (value === "unsure") state.skipped.push(field);
    else state.profile = mergeProfile(state.profile, { [field]: value });
    understood = true;
  }
  if (text) {
    if (state.pendingField && !m) {
      const ans = parseAnswer(state.pendingField, text);
      if (ans === "unsure") {
        state.skipped.push(state.pendingField);
        understood = true;
      } else if (ans !== undefined) {
        state.profile = mergeProfile(state.profile, { [state.pendingField]: ans });
        understood = true;
      }
    }
    const facts = parseProfileFromText(text);
    if (Object.keys(facts).length) {
      state.profile = mergeProfile(state.profile, facts);
      understood = true;
    }
  }
  if (!understood && (text || reply)) {
    const again = state.pendingField ? [questionFor(state.pendingField, state.lang)] : [];
    if (prev.questionsAsked === 0 && !state.pendingField) {
      // First contact with nothing parseable: greet and start.
      state.pendingField = DEFAULT_QUESTION_ORDER[0];
      state.questionsAsked = 1;
      return { state, messages: [{ text: `${L.greeting}\n\n_${L.freeServiceNote}_` }, questionFor(state.pendingField!, state.lang)] };
    }
    return { state, messages: [{ text: L.notUnderstood }, ...again] };
  }

  // 5) Decide: ask the next most useful question, or show results.
  state.pendingField = undefined;
  state.resultPage = 0;
  if (state.questionsAsked < MAX_QUESTIONS) {
    const r = await findSchemes({ repo: ctx.repo, channel: ctx.channel, now: ctx.now }, { profile: state.profile, lang: state.lang, limit: 1 });
    const coreMissing = (["state", "age", "gender", "occupation"] as ProfileField[]).filter((f) => state.profile[f] === undefined && !state.skipped.includes(f));
    const next = coreMissing[0] ?? nextQuestion(state, r.askNext.map((a) => a.field));
    if (next) {
      state.pendingField = next;
      state.questionsAsked += 1;
      return { state, messages: [questionFor(next, state.lang)] };
    }
  }
  return { state, messages: await resultsMessages(state, ctx) };
}

/** Plain-text rendering for channels without buttons (SMS / fallback). */
export function renderPlain(msg: OutMessage): string {
  const opts = msg.buttons?.map((b, i) => `${i + 1}. ${b.title}`) ?? msg.list?.rows.map((r, i) => `${i + 1}. ${r.title}`) ?? [];
  return opts.length ? `${msg.text}\n${opts.join("\n")}` : msg.text;
}

export { formatInr };
