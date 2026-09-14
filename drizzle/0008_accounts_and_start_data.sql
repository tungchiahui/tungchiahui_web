CREATE SCHEMA "account_auth";
--> statement-breakpoint
CREATE TYPE "app"."account_role" AS ENUM('owner', 'user');--> statement-breakpoint
CREATE TABLE "account_auth"."sessions" (
	"token_hash" text PRIMARY KEY NOT NULL,
	"account_id" uuid NOT NULL,
	"credential_version" text NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "app"."accounts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"username" text NOT NULL,
	"role" "app"."account_role" DEFAULT 'user' NOT NULL,
	"password_hash" text NOT NULL,
	"disabled" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "accounts_username_not_empty" CHECK (length("app"."accounts"."username") BETWEEN 1 AND 80),
	CONSTRAINT "accounts_password_hash_not_empty" CHECK (length("app"."accounts"."password_hash") > 0)
);
--> statement-breakpoint
CREATE TABLE "app"."start_datasets" (
	"account_id" uuid PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"revision" bigint DEFAULT 0 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" text NOT NULL,
	CONSTRAINT "start_datasets_payload_object" CHECK (jsonb_typeof("app"."start_datasets"."payload") = 'object'),
	CONSTRAINT "start_datasets_revision_nonnegative" CHECK ("app"."start_datasets"."revision" >= 0),
	CONSTRAINT "start_datasets_updated_by_not_empty" CHECK (length("app"."start_datasets"."updated_by") > 0)
);
--> statement-breakpoint
ALTER TABLE "account_auth"."sessions" ADD CONSTRAINT "sessions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "app"."start_datasets" ADD CONSTRAINT "start_datasets_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "app"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "account_sessions_expiry_idx" ON "account_auth"."sessions" USING btree ("expires_at");--> statement-breakpoint
CREATE UNIQUE INDEX "accounts_username_unique" ON "app"."accounts" USING btree ("username");--> statement-breakpoint
REVOKE ALL ON SCHEMA account_auth FROM PUBLIC;--> statement-breakpoint
GRANT USAGE ON SCHEMA account_auth TO site_control_api, site_backup;--> statement-breakpoint
GRANT SELECT, INSERT, DELETE ON account_auth.sessions TO site_control_api;--> statement-breakpoint
GRANT SELECT, INSERT, UPDATE ON app.accounts, app.start_datasets TO site_control_api;--> statement-breakpoint
DELETE FROM app.start_datasets WHERE account_id IN (SELECT id FROM app.accounts WHERE role = 'owner');--> statement-breakpoint
DELETE FROM app.accounts WHERE role = 'owner';--> statement-breakpoint
DELETE FROM owner_auth.sessions;
