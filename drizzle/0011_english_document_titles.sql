CREATE TABLE "app"."document_translation_fields" (
	"document_id" uuid NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"field" text NOT NULL,
	"segment_id" uuid NOT NULL,
	CONSTRAINT "document_translation_fields_document_id_locale_field_pk" PRIMARY KEY("document_id","locale","field"),
	CONSTRAINT "document_translation_fields_english_only" CHECK ("app"."document_translation_fields"."locale" = 'en-us'),
	CONSTRAINT "document_translation_fields_known" CHECK ("app"."document_translation_fields"."field" IN ('title', 'wikiGroupTitle'))
);
--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "translated_fields" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "field_translation_version" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD COLUMN "field_source_hash" text;--> statement-breakpoint
ALTER TABLE "app"."document_translation_fields" ADD CONSTRAINT "document_translation_fields_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."document_translation_fields" ADD CONSTRAINT "document_translation_fields_segment_id_translation_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "app"."translation_segments"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "document_translation_fields_segment_idx" ON "app"."document_translation_fields" USING btree ("segment_id");--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_fields_object" CHECK (jsonb_typeof("app"."document_translations"."translated_fields") = 'object');--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_fields_version" CHECK ("app"."document_translations"."field_translation_version" >= 0);--> statement-breakpoint
ALTER TABLE "app"."document_translations" ADD CONSTRAINT "document_translations_field_source_hash" CHECK ("app"."document_translations"."field_source_hash" IS NULL OR "app"."document_translations"."field_source_hash" ~ '^[a-f0-9]{64}$');
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.document_translation_fields TO site_content_worker;
--> statement-breakpoint
REVOKE ALL ON app.document_translation_fields FROM site_app, site_control_api;
