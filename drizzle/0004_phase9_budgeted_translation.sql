CREATE TYPE "app"."translation_execution_mode" AS ENUM('dry-run', 'execute');--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD COLUMN "execution_mode" "app"."translation_execution_mode" DEFAULT 'dry-run' NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD COLUMN "force" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD COLUMN "provider_request_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD COLUMN "completed_segment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD COLUMN "remaining_segment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD COLUMN "cancel_requested_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD CONSTRAINT "translation_jobs_provider_requests_nonnegative" CHECK ("app"."translation_jobs"."provider_request_count" >= 0);--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD CONSTRAINT "translation_jobs_completed_segments_nonnegative" CHECK ("app"."translation_jobs"."completed_segment_count" >= 0);--> statement-breakpoint
ALTER TABLE "app"."translation_jobs" ADD CONSTRAINT "translation_jobs_remaining_segments_nonnegative" CHECK ("app"."translation_jobs"."remaining_segment_count" >= 0);