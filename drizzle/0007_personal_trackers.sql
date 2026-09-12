CREATE SCHEMA "owner_auth";
--> statement-breakpoint
CREATE TABLE "owner_auth"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"credential_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX "owner_sessions_expiry_idx" ON "owner_auth"."sessions" USING btree ("expires_at");
--> statement-breakpoint
REVOKE ALL ON SCHEMA owner_auth FROM PUBLIC;
GRANT USAGE ON SCHEMA owner_auth TO site_control_api, site_backup;
GRANT SELECT, INSERT, DELETE ON owner_auth.sessions TO site_control_api;
--> statement-breakpoint
INSERT INTO app.owner_managed_datasets (dataset_key, payload, updated_by)
VALUES ('tech_footprint', '{"version":2,"records":{}}', 'personal-trackers-initialization'),
       ('weight_loss', '{"version":2,"records":[]}', 'personal-trackers-initialization')
ON CONFLICT (dataset_key) DO NOTHING;
