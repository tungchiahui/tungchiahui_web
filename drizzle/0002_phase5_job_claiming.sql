DROP INDEX "app"."operational_jobs_claim_idx";--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD COLUMN "max_attempts" integer DEFAULT 3 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD COLUMN "available_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD COLUMN "claimed_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD COLUMN "claimed_by" text;--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD COLUMN "claim_expires_at" timestamp with time zone;--> statement-breakpoint
CREATE INDEX "operational_jobs_claim_idx" ON "app"."operational_jobs" USING btree ("status","available_at","created_at");--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD CONSTRAINT "operational_jobs_max_attempts_positive" CHECK ("app"."operational_jobs"."max_attempts" > 0);--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD CONSTRAINT "operational_jobs_attempt_within_limit" CHECK ("app"."operational_jobs"."attempt_count" <= "app"."operational_jobs"."max_attempts");--> statement-breakpoint
ALTER TABLE "app"."operational_jobs" ADD CONSTRAINT "operational_jobs_claim_consistent" CHECK (("app"."operational_jobs"."status" = 'running' AND "app"."operational_jobs"."claimed_at" IS NOT NULL AND "app"."operational_jobs"."claimed_by" IS NOT NULL AND "app"."operational_jobs"."claim_expires_at" IS NOT NULL) OR ("app"."operational_jobs"."status" <> 'running' AND "app"."operational_jobs"."claimed_at" IS NULL AND "app"."operational_jobs"."claimed_by" IS NULL AND "app"."operational_jobs"."claim_expires_at" IS NULL));