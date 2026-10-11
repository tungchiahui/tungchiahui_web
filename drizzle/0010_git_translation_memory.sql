CREATE TABLE "app"."content_source_files" (
	"path" text PRIMARY KEY NOT NULL,
	"blob_sha" text NOT NULL,
	"contents" text NOT NULL,
	"cache_version" integer NOT NULL,
	CONSTRAINT "content_source_files_sha" CHECK ("app"."content_source_files"."blob_sha" ~ '^[a-f0-9]{40}$'),
	CONSTRAINT "content_source_files_version" CHECK ("app"."content_source_files"."cache_version" > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."content_sync_state" (
	"key" text PRIMARY KEY NOT NULL,
	"source_commit" text NOT NULL,
	"memory_commit" text,
	"memory_enabled" boolean DEFAULT false NOT NULL,
	CONSTRAINT "content_sync_state_singleton" CHECK ("app"."content_sync_state"."key" = 'canonical'),
	CONSTRAINT "content_sync_state_sha" CHECK ("app"."content_sync_state"."source_commit" ~ '^[a-f0-9]{40}$')
);
--> statement-breakpoint
CREATE TABLE "app"."git_translation_entries" (
	"key" text PRIMARY KEY NOT NULL,
	"shard_path" text NOT NULL,
	"segment_id" uuid NOT NULL,
	"record_hash" text NOT NULL,
	CONSTRAINT "git_translation_entries_key" CHECK ("app"."git_translation_entries"."key" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "git_translation_entries_hash" CHECK ("app"."git_translation_entries"."record_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "app"."git_translation_entries" ADD CONSTRAINT "git_translation_entries_segment_id_translation_segments_id_fk" FOREIGN KEY ("segment_id") REFERENCES "app"."translation_segments"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "git_translation_entries_shard" ON "app"."git_translation_entries" USING btree ("shard_path");--> statement-breakpoint
CREATE UNIQUE INDEX "git_translation_entries_segment" ON "app"."git_translation_entries" USING btree ("segment_id");
--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE, DELETE ON app.content_source_files, app.content_sync_state, app.git_translation_entries TO site_content_worker;
