CREATE TYPE "app"."ingestion_run_status" AS ENUM('running', 'completed', 'failed');--> statement-breakpoint
CREATE TYPE "app"."locale" AS ENUM('zh-cn', 'zh-hk', 'zh-tw', 'en-us');--> statement-breakpoint
CREATE TYPE "app"."translation_job_status" AS ENUM('queued', 'running', 'completed', 'partial', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."translation_scope" AS ENUM('pending', 'changed', 'article', 'all');--> statement-breakpoint
CREATE TYPE "app"."translation_segment_status" AS ENUM('pending', 'translated', 'fallback', 'stale', 'failed', 'reviewed');--> statement-breakpoint
CREATE TABLE "app"."content_aliases" (
	"alias_path" text PRIMARY KEY NOT NULL,
	"document_id" uuid NOT NULL,
	"approval_reference" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "content_aliases_wiki_only" CHECK ("app"."content_aliases"."alias_path" LIKE '/wiki/%'),
	CONSTRAINT "content_aliases_approval_not_empty" CHECK (length("app"."content_aliases"."approval_reference") > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."document_translations" (
	"document_id" uuid NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"translated_markdown" text NOT NULL,
	"translation_hash" text NOT NULL,
	"translation_version" integer NOT NULL,
	"generated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_translations_document_id_locale_pk" PRIMARY KEY("document_id","locale"),
	CONSTRAINT "document_translations_noncanonical_locale" CHECK ("app"."document_translations"."locale" <> 'zh-cn'),
	CONSTRAINT "document_translations_hash_sha256" CHECK ("app"."document_translations"."translation_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "document_translations_version_positive" CHECK ("app"."document_translations"."translation_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."ingestion_runs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"operational_job_id" uuid NOT NULL,
	"source_commit" text NOT NULL,
	"started_at" timestamp with time zone DEFAULT now() NOT NULL,
	"finished_at" timestamp with time zone,
	"status" "app"."ingestion_run_status" NOT NULL,
	"files_seen" integer DEFAULT 0 NOT NULL,
	"files_changed" integer DEFAULT 0 NOT NULL,
	"files_deleted" integer DEFAULT 0 NOT NULL,
	"error_summary" text,
	CONSTRAINT "ingestion_runs_source_commit_hash" CHECK ("app"."ingestion_runs"."source_commit" ~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'),
	CONSTRAINT "ingestion_runs_files_seen_nonnegative" CHECK ("app"."ingestion_runs"."files_seen" >= 0),
	CONSTRAINT "ingestion_runs_files_changed_nonnegative" CHECK ("app"."ingestion_runs"."files_changed" >= 0),
	CONSTRAINT "ingestion_runs_files_deleted_nonnegative" CHECK ("app"."ingestion_runs"."files_deleted" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."translation_jobs" (
	"id" uuid PRIMARY KEY NOT NULL,
	"status" "app"."translation_job_status" DEFAULT 'queued' NOT NULL,
	"scope" "app"."translation_scope" NOT NULL,
	"document_id" uuid,
	"requested_by" text NOT NULL,
	"budget_usd" numeric(12, 6) NOT NULL,
	"estimated_input_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_output_tokens" integer DEFAULT 0 NOT NULL,
	"estimated_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"actual_input_tokens" integer DEFAULT 0 NOT NULL,
	"actual_output_tokens" integer DEFAULT 0 NOT NULL,
	"actual_cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_summary" text,
	CONSTRAINT "translation_jobs_requested_by_not_empty" CHECK (length("app"."translation_jobs"."requested_by") > 0),
	CONSTRAINT "translation_jobs_budget_nonnegative" CHECK ("app"."translation_jobs"."budget_usd" >= 0),
	CONSTRAINT "translation_jobs_estimated_input_nonnegative" CHECK ("app"."translation_jobs"."estimated_input_tokens" >= 0),
	CONSTRAINT "translation_jobs_estimated_output_nonnegative" CHECK ("app"."translation_jobs"."estimated_output_tokens" >= 0),
	CONSTRAINT "translation_jobs_estimated_cost_nonnegative" CHECK ("app"."translation_jobs"."estimated_cost_usd" >= 0),
	CONSTRAINT "translation_jobs_actual_input_nonnegative" CHECK ("app"."translation_jobs"."actual_input_tokens" >= 0),
	CONSTRAINT "translation_jobs_actual_output_nonnegative" CHECK ("app"."translation_jobs"."actual_output_tokens" >= 0),
	CONSTRAINT "translation_jobs_actual_cost_nonnegative" CHECK ("app"."translation_jobs"."actual_cost_usd" >= 0),
	CONSTRAINT "translation_jobs_article_scope_document" CHECK (("app"."translation_jobs"."scope" = 'article' AND "app"."translation_jobs"."document_id" IS NOT NULL) OR ("app"."translation_jobs"."scope" <> 'article' AND "app"."translation_jobs"."document_id" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."translation_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"source_hash" text NOT NULL,
	"source_text" text NOT NULL,
	"source_ast_type" text NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"translated_text" text,
	"context_fingerprint" text NOT NULL,
	"status" "app"."translation_segment_status" NOT NULL,
	"provider" text,
	"model" text,
	"input_tokens" integer DEFAULT 0 NOT NULL,
	"output_tokens" integer DEFAULT 0 NOT NULL,
	"cost_usd" numeric(12, 6) DEFAULT '0' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "translation_segments_noncanonical_locale" CHECK ("app"."translation_segments"."locale" <> 'zh-cn'),
	CONSTRAINT "translation_segments_source_hash_sha256" CHECK ("app"."translation_segments"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "translation_segments_context_not_empty" CHECK (length("app"."translation_segments"."context_fingerprint") > 0),
	CONSTRAINT "translation_segments_input_tokens_nonnegative" CHECK ("app"."translation_segments"."input_tokens" >= 0),
	CONSTRAINT "translation_segments_output_tokens_nonnegative" CHECK ("app"."translation_segments"."output_tokens" >= 0),
	CONSTRAINT "translation_segments_cost_nonnegative" CHECK ("app"."translation_segments"."cost_usd" >= 0)
);
--> statement-breakpoint
ALTER TABLE "app"."content_aliases" ADD CONSTRAINT "content_aliases_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."ingestion_runs" ADD CONSTRAINT "ingestion_runs_operational_job_id_operational_jobs_id_fk" FOREIGN KEY ("operational_job_id") REFERENCES "app"."operational_jobs"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD CONSTRAINT "translation_jobs_id_operational_jobs_id_fk" FOREIGN KEY ("id") REFERENCES "app"."operational_jobs"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD CONSTRAINT "translation_jobs_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "content_aliases_document_idx" ON "app"."content_aliases" USING btree ("document_id");--> statement-breakpoint
CREATE UNIQUE INDEX "ingestion_runs_operational_job_unique" ON "app"."ingestion_runs" USING btree ("operational_job_id");--> statement-breakpoint
CREATE INDEX "ingestion_runs_source_commit_idx" ON "app"."ingestion_runs" USING btree ("source_commit");--> statement-breakpoint
CREATE UNIQUE INDEX "translation_segments_memory_unique" ON "app"."translation_segments" USING btree ("source_hash","locale","context_fingerprint");--> statement-breakpoint
CREATE INDEX "translation_segments_pending_idx" ON "app"."translation_segments" USING btree ("locale","status");