CREATE TABLE "app"."document_translation_segments" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"segment_id" uuid NOT NULL,
	"previous_segment_id" uuid,
	"ordinal" integer NOT NULL,
	"source_start" integer NOT NULL,
	"source_end" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "document_translation_segments_english_only" CHECK ("app"."document_translation_segments"."locale" = 'en-us'),
	CONSTRAINT "document_translation_segments_ordinal_nonnegative" CHECK ("app"."document_translation_segments"."ordinal" >= 0),
	CONSTRAINT "document_translation_segments_start_nonnegative" CHECK ("app"."document_translation_segments"."source_start" >= 0),
	CONSTRAINT "document_translation_segments_range_valid" CHECK ("app"."document_translation_segments"."source_end" > "app"."document_translation_segments"."source_start"),
	CONSTRAINT "document_translation_segments_previous_distinct" CHECK ("app"."document_translation_segments"."previous_segment_id" IS NULL OR "app"."document_translation_segments"."previous_segment_id" <> "app"."document_translation_segments"."segment_id")
);
--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "source_hash" text;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "pending_segment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "translated_segment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "fallback_segment_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "translation_memory_hits" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_segments" ADD COLUMN "is_translatable" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."translation_segments" ADD COLUMN "normalization_version" integer DEFAULT 1 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_translation_segments" ADD CONSTRAINT "document_translation_segments_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_translation_segments" ADD CONSTRAINT "document_translation_segments_segment_id_translation_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "app"."translation_segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_translation_segments" ADD CONSTRAINT "document_translation_segments_previous_segment_id_translation_segments_id_fk" FOREIGN KEY ("previous_segment_id") REFERENCES "app"."translation_segments"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "document_translation_segments_ordinal_unique" ON "app"."document_translation_segments" USING btree ("document_id","locale","ordinal");--> statement-breakpoint
CREATE INDEX "document_translation_segments_segment_idx" ON "app"."document_translation_segments" USING btree ("segment_id");--> statement-breakpoint
CREATE INDEX "document_translation_segments_previous_idx" ON "app"."document_translation_segments" USING btree ("previous_segment_id");--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_source_hash_sha256" CHECK ("app"."document_translations"."source_hash" IS NULL OR "app"."document_translations"."source_hash" ~ '^[a-f0-9]{64}$');--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_pending_nonnegative" CHECK ("app"."document_translations"."pending_segment_count" >= 0);--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_translated_nonnegative" CHECK ("app"."document_translations"."translated_segment_count" >= 0);--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_fallback_nonnegative" CHECK ("app"."document_translations"."fallback_segment_count" >= 0);--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_hits_nonnegative" CHECK ("app"."document_translations"."translation_memory_hits" >= 0);--> statement-breakpoint
ALTER TABLE "app"."translation_segments" ADD CONSTRAINT "translation_segments_normalization_version_positive" CHECK ("app"."translation_segments"."normalization_version" > 0);