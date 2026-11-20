CREATE EXTENSION IF NOT EXISTS vector;--> statement-breakpoint
CREATE TYPE "public"."author_kind" AS ENUM('curated', 'llm', 'human', 'importer');--> statement-breakpoint
CREATE TYPE "public"."channel" AS ENUM('mcp', 'whatsapp', 'web', 'api');--> statement-breakpoint
CREATE TYPE "public"."link_status" AS ENUM('unchecked', 'ok', 'changed', 'broken');--> statement-breakpoint
CREATE TYPE "public"."report_status" AS ENUM('open', 'in_review', 'resolved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."review_status" AS ENUM('pending', 'approved', 'rejected');--> statement-breakpoint
CREATE TYPE "public"."scheme_level" AS ENUM('central', 'state');--> statement-breakpoint
CREATE TYPE "public"."scheme_status" AS ENUM('active', 'closed', 'unknown');--> statement-breakpoint
CREATE TABLE "admin_api_keys" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" text NOT NULL,
	"key_hash" text NOT NULL,
	"scopes" text[] DEFAULT '{}'::text[] NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_used_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	CONSTRAINT "admin_api_keys_key_hash_unique" UNIQUE("key_hash")
);
--> statement-breakpoint
CREATE TABLE "chat_sessions" (
	"key" text PRIMARY KEY NOT NULL,
	"channel" "channel" NOT NULL,
	"state" jsonb NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "eligibility_rules" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"rule" jsonb NOT NULL,
	"source_text" text,
	"generated_by" "author_kind" NOT NULL,
	"model" text,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp with time zone,
	"review_notes" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "ingest_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_id" text,
	"job" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"stats" jsonb,
	"error" text
);
--> statement-breakpoint
CREATE TABLE "reports" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"scheme_id" uuid NOT NULL,
	"message" text NOT NULL,
	"channel" "channel" NOT NULL,
	"status" "report_status" DEFAULT 'open' NOT NULL,
	"resolution_note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "scheme_embeddings" (
	"scheme_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"model" text NOT NULL,
	"embedding" vector(1024) NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_embeddings_scheme_id_lang_pk" PRIMARY KEY("scheme_id","lang")
);
--> statement-breakpoint
CREATE TABLE "scheme_translations" (
	"scheme_id" uuid NOT NULL,
	"lang" text NOT NULL,
	"name" text NOT NULL,
	"short_description" text NOT NULL,
	"benefits" text NOT NULL,
	"how_to_apply_steps" jsonb NOT NULL,
	"documents_required" jsonb NOT NULL,
	"translated_by" "author_kind" DEFAULT 'llm' NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "scheme_translations_scheme_id_lang_pk" PRIMARY KEY("scheme_id","lang")
);
--> statement-breakpoint
CREATE TABLE "schemes" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" jsonb NOT NULL,
	"ministry" text NOT NULL,
	"level" "scheme_level" NOT NULL,
	"state_code" text,
	"category" text NOT NULL,
	"short_description" text NOT NULL,
	"benefits" text NOT NULL,
	"how_to_apply_steps" jsonb NOT NULL,
	"documents_required" jsonb NOT NULL,
	"official_apply_url" text NOT NULL,
	"source_url" text NOT NULL,
	"source_id" text,
	"last_verified_at" timestamp with time zone,
	"status" "scheme_status" DEFAULT 'unknown' NOT NULL,
	"deadline" date,
	"benefit_value_inr" integer,
	"tags" text[] DEFAULT '{}'::text[] NOT NULL,
	"review_status" "review_status" DEFAULT 'pending' NOT NULL,
	"link_status" "link_status" DEFAULT 'unchecked' NOT NULL,
	"content_hash" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "sources" (
	"id" text PRIMARY KEY NOT NULL,
	"name" text NOT NULL,
	"base_url" text NOT NULL,
	"kind" text NOT NULL,
	"state_code" text,
	"enabled" boolean DEFAULT false NOT NULL,
	"robots_checked_at" timestamp with time zone,
	"robots_allows" boolean,
	"terms_notes" text,
	"rate_limit_ms" integer DEFAULT 2000 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "usage_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"channel" "channel" NOT NULL,
	"tool" text NOT NULL,
	"state_code" text,
	"lang" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "verification_events" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"scheme_id" uuid NOT NULL,
	"kind" text NOT NULL,
	"detail" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "eligibility_rules" ADD CONSTRAINT "eligibility_rules_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ingest_runs" ADD CONSTRAINT "ingest_runs_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "reports" ADD CONSTRAINT "reports_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_embeddings" ADD CONSTRAINT "scheme_embeddings_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "scheme_translations" ADD CONSTRAINT "scheme_translations_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "schemes" ADD CONSTRAINT "schemes_source_id_sources_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."sources"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "verification_events" ADD CONSTRAINT "verification_events_scheme_id_schemes_id_fk" FOREIGN KEY ("scheme_id") REFERENCES "public"."schemes"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "chat_sessions_expiry_idx" ON "chat_sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "rules_scheme_version_uq" ON "eligibility_rules" USING btree ("scheme_id","version");--> statement-breakpoint
CREATE INDEX "rules_review_idx" ON "eligibility_rules" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "reports_status_idx" ON "reports" USING btree ("status");--> statement-breakpoint
CREATE UNIQUE INDEX "schemes_slug_uq" ON "schemes" USING btree ("slug");--> statement-breakpoint
CREATE INDEX "schemes_state_idx" ON "schemes" USING btree ("level","state_code");--> statement-breakpoint
CREATE INDEX "schemes_review_idx" ON "schemes" USING btree ("review_status");--> statement-breakpoint
CREATE INDEX "schemes_deadline_idx" ON "schemes" USING btree ("deadline");--> statement-breakpoint
CREATE INDEX "usage_created_idx" ON "usage_events" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "usage_channel_idx" ON "usage_events" USING btree ("channel","created_at");--> statement-breakpoint
CREATE INDEX "verification_scheme_idx" ON "verification_events" USING btree ("scheme_id","created_at");