import { sql } from "drizzle-orm";
import {
  bigserial,
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";
import type { RuleNode } from "@ym/core";

export const EMBEDDING_DIM = 1024;

export const schemeLevel = pgEnum("scheme_level", ["central", "state"]);
export const schemeStatus = pgEnum("scheme_status", ["active", "closed", "unknown"]);
export const reviewStatus = pgEnum("review_status", ["pending", "approved", "rejected"]);
export const linkStatus = pgEnum("link_status", ["unchecked", "ok", "changed", "broken"]);
export const reportStatus = pgEnum("report_status", ["open", "in_review", "resolved", "rejected"]);
export const channel = pgEnum("channel", ["mcp", "whatsapp", "web", "api"]);
export const authorKind = pgEnum("author_kind", ["curated", "llm", "human", "importer"]);

export const sources = pgTable("sources", {
  id: text("id").primaryKey(), // e.g. "myscheme", "state-gj-portal"
  name: text("name").notNull(),
  baseUrl: text("base_url").notNull(),
  kind: text("kind").notNull(), // "myscheme" | "html" | "json" | "curated"
  stateCode: text("state_code"),
  enabled: boolean("enabled").notNull().default(false),
  robotsCheckedAt: timestamp("robots_checked_at", { withTimezone: true }),
  robotsAllows: boolean("robots_allows"),
  termsNotes: text("terms_notes"),
  rateLimitMs: integer("rate_limit_ms").notNull().default(2000),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const schemes = pgTable(
  "schemes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slug: text("slug").notNull(),
    /** Official name per language, e.g. {"en": "...", "hi": "..."} — kept in official form. */
    name: jsonb("name").$type<Record<string, string>>().notNull(),
    ministry: text("ministry").notNull(),
    level: schemeLevel("level").notNull(),
    stateCode: text("state_code"),
    category: text("category").notNull(),
    shortDescription: text("short_description").notNull(),
    benefits: text("benefits").notNull(),
    howToApplySteps: jsonb("how_to_apply_steps").$type<string[]>().notNull(),
    documentsRequired: jsonb("documents_required").$type<string[]>().notNull(),
    officialApplyUrl: text("official_apply_url").notNull(),
    sourceUrl: text("source_url").notNull(),
    sourceId: text("source_id").references(() => sources.id),
    lastVerifiedAt: timestamp("last_verified_at", { withTimezone: true }),
    status: schemeStatus("status").notNull().default("unknown"),
    deadline: date("deadline"),
    benefitValueInr: integer("benefit_value_inr"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    reviewStatus: reviewStatus("review_status").notNull().default("pending"),
    linkStatus: linkStatus("link_status").notNull().default("unchecked"),
    contentHash: text("content_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("schemes_slug_uq").on(t.slug),
    index("schemes_state_idx").on(t.level, t.stateCode),
    index("schemes_review_idx").on(t.reviewStatus),
    index("schemes_deadline_idx").on(t.deadline),
  ],
);

export const schemeTranslations = pgTable(
  "scheme_translations",
  {
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(),
    name: text("name").notNull(),
    shortDescription: text("short_description").notNull(),
    benefits: text("benefits").notNull(),
    howToApplySteps: jsonb("how_to_apply_steps").$type<string[]>().notNull(),
    documentsRequired: jsonb("documents_required").$type<string[]>().notNull(),
    translatedBy: authorKind("translated_by").notNull().default("llm"),
    reviewStatus: reviewStatus("review_status").notNull().default("pending"),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.schemeId, t.lang] })],
);

export const eligibilityRules = pgTable(
  "eligibility_rules",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    version: integer("version").notNull().default(1),
    rule: jsonb("rule").$type<RuleNode>().notNull(),
    /** The official eligibility text the rule was derived from. */
    sourceText: text("source_text"),
    generatedBy: authorKind("generated_by").notNull(),
    model: text("model"),
    reviewStatus: reviewStatus("review_status").notNull().default("pending"),
    reviewedBy: text("reviewed_by"),
    reviewedAt: timestamp("reviewed_at", { withTimezone: true }),
    reviewNotes: text("review_notes"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("rules_scheme_version_uq").on(t.schemeId, t.version),
    index("rules_review_idx").on(t.reviewStatus),
  ],
);

export const reports = pgTable(
  "reports",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    message: text("message").notNull(), // redacted before insert
    channel: channel("channel").notNull(),
    status: reportStatus("status").notNull().default("open"),
    resolutionNote: text("resolution_note"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("reports_status_idx").on(t.status)],
);

/** Anonymous counters only: never names, phone numbers, Aadhaar, bank or any ID numbers. */
export const usageEvents = pgTable(
  "usage_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    channel: channel("channel").notNull(),
    tool: text("tool").notNull(),
    stateCode: text("state_code"),
    lang: text("lang"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("usage_created_idx").on(t.createdAt), index("usage_channel_idx").on(t.channel, t.createdAt)],
);

export const schemeEmbeddings = pgTable(
  "scheme_embeddings",
  {
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    lang: text("lang").notNull(),
    model: text("model").notNull(),
    embedding: vector("embedding", { dimensions: EMBEDDING_DIM }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [primaryKey({ columns: [t.schemeId, t.lang] })],
);

/** Ephemeral conversation state (WhatsApp / web chat). Key is an HMAC, never a raw phone number. */
export const chatSessions = pgTable(
  "chat_sessions",
  {
    key: text("key").primaryKey(),
    channel: channel("channel").notNull(),
    state: jsonb("state").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("chat_sessions_expiry_idx").on(t.expiresAt)],
);

export const ingestRuns = pgTable("ingest_runs", {
  id: uuid("id").primaryKey().defaultRandom(),
  sourceId: text("source_id").references(() => sources.id),
  job: text("job").notNull(), // "ingest" | "reverify" | "translate"
  startedAt: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  stats: jsonb("stats").$type<Record<string, number>>(),
  error: text("error"),
});

export const verificationEvents = pgTable(
  "verification_events",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    schemeId: uuid("scheme_id")
      .notNull()
      .references(() => schemes.id, { onDelete: "cascade" }),
    kind: text("kind").notNull(), // "link_ok" | "link_broken" | "content_changed" | "approved" | "rejected"
    detail: jsonb("detail").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("verification_scheme_idx").on(t.schemeId, t.createdAt)],
);

export const adminApiKeys = pgTable("admin_api_keys", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  keyHash: text("key_hash").notNull().unique(), // sha256 of the key; raw key is shown once
  scopes: text("scopes").array().notNull().default(sql`'{}'::text[]`),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
  revokedAt: timestamp("revoked_at", { withTimezone: true }),
});
