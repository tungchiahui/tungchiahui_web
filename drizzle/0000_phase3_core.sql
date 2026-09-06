CREATE SCHEMA "app";
--> statement-breakpoint
CREATE TYPE "app"."application_job_status" AS ENUM('queued', 'running', 'retry_wait', 'completed', 'failed', 'cancelled');--> statement-breakpoint
CREATE TYPE "app"."application_job_type" AS ENUM('content_sync', 'translation', 'search_reindex', 'cache_revalidation');--> statement-breakpoint
CREATE TYPE "app"."content_type" AS ENUM('blog', 'wiki');--> statement-breakpoint
CREATE TYPE "app"."owner_dataset_key" AS ENUM('tech_footprint', 'weight_loss');--> statement-breakpoint
CREATE TABLE "app"."documents" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"content_type" "app"."content_type" NOT NULL,
	"source_path" text NOT NULL,
	"source_commit" text NOT NULL,
	"title" text NOT NULL,
	"raw_frontmatter" jsonb NOT NULL,
	"raw_markdown" text NOT NULL,
	"source_hash" text NOT NULL,
	"route_path" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"source_updated_at" timestamp with time zone,
	"ingested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_deleted" boolean DEFAULT false NOT NULL,
	"deleted_at" timestamp with time zone,
	CONSTRAINT "documents_source_path_not_empty" CHECK (length("app"."documents"."source_path") > 0),
	CONSTRAINT "documents_route_path_absolute" CHECK ("app"."documents"."route_path" LIKE '/%'),
	CONSTRAINT "documents_source_hash_sha256" CHECK ("app"."documents"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "documents_source_commit_hash" CHECK ("app"."documents"."source_commit" ~ '^(?:[a-f0-9]{40}|[a-f0-9]{64})$'),
	CONSTRAINT "documents_frontmatter_object" CHECK (jsonb_typeof("app"."documents"."raw_frontmatter") = 'object'),
	CONSTRAINT "documents_delete_timestamp_consistent" CHECK (("app"."documents"."is_deleted" AND "app"."documents"."deleted_at" IS NOT NULL) OR (NOT "app"."documents"."is_deleted" AND "app"."documents"."deleted_at" IS NULL))
);
--> statement-breakpoint
CREATE TABLE "app"."operational_jobs" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"job_type" "app"."application_job_type" NOT NULL,
	"status" "app"."application_job_status" DEFAULT 'queued' NOT NULL,
	"requested_by" text NOT NULL,
	"idempotency_key" text NOT NULL,
	"payload" jsonb NOT NULL,
	"progress" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"attempt_count" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"started_at" timestamp with time zone,
	"finished_at" timestamp with time zone,
	"error_summary" text,
	CONSTRAINT "operational_jobs_requested_by_not_empty" CHECK (length("app"."operational_jobs"."requested_by") > 0),
	CONSTRAINT "operational_jobs_payload_object" CHECK (jsonb_typeof("app"."operational_jobs"."payload") = 'object'),
	CONSTRAINT "operational_jobs_progress_object" CHECK (jsonb_typeof("app"."operational_jobs"."progress") = 'object'),
	CONSTRAINT "operational_jobs_attempt_nonnegative" CHECK ("app"."operational_jobs"."attempt_count" >= 0)
);
--> statement-breakpoint
CREATE TABLE "app"."owner_managed_datasets" (
	"dataset_key" "app"."owner_dataset_key" PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "owner_managed_datasets_payload_object" CHECK (jsonb_typeof("app"."owner_managed_datasets"."payload") = 'object'),
	CONSTRAINT "owner_managed_datasets_revision_nonnegative" CHECK ("app"."owner_managed_datasets"."revision" >= 0),
	CONSTRAINT "owner_managed_datasets_updated_by_not_empty" CHECK (length("app"."owner_managed_datasets"."updated_by") > 0)
);
--> statement-breakpoint
CREATE UNIQUE INDEX "documents_source_path_unique" ON "app"."documents" USING btree ("source_path");--> statement-breakpoint
CREATE UNIQUE INDEX "documents_route_path_unique" ON "app"."documents" USING btree ("route_path");--> statement-breakpoint
CREATE INDEX "documents_content_type_idx" ON "app"."documents" USING btree ("content_type");--> statement-breakpoint
CREATE UNIQUE INDEX "operational_jobs_idempotency_key_unique" ON "app"."operational_jobs" USING btree ("idempotency_key");--> statement-breakpoint
CREATE INDEX "operational_jobs_claim_idx" ON "app"."operational_jobs" USING btree ("status","created_at");