CREATE TABLE "app"."search_documents" (
	"document_id" uuid NOT NULL,
	"locale" "app"."locale" NOT NULL,
	"content_type" "app"."content_type" NOT NULL,
	"route_path" text NOT NULL,
	"title" text NOT NULL,
	"headings" text NOT NULL,
	"body" text NOT NULL,
	"metadata" text NOT NULL,
	"source_hash" text NOT NULL,
	"projection_hash" text NOT NULL,
	"source_updated_at" timestamp with time zone,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "search_documents_document_id_locale_pk" PRIMARY KEY("document_id","locale"),
	CONSTRAINT "search_documents_route_path_absolute" CHECK ("app"."search_documents"."route_path" LIKE '/%'),
	CONSTRAINT "search_documents_title_not_empty" CHECK (length("app"."search_documents"."title") > 0),
	CONSTRAINT "search_documents_source_hash_sha256" CHECK ("app"."search_documents"."source_hash" ~ '^[a-f0-9]{64}$'),
	CONSTRAINT "search_documents_projection_hash_sha256" CHECK ("app"."search_documents"."projection_hash" ~ '^[a-f0-9]{64}$')
);
--> statement-breakpoint
ALTER TABLE "app"."search_documents" ADD CONSTRAINT "search_documents_document_id_documents_id_fk" FOREIGN KEY ("document_id") REFERENCES "app"."documents"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "search_documents_locale_type_idx" ON "app"."search_documents" USING btree ("locale","content_type");--> statement-breakpoint
CREATE INDEX "search_documents_full_text_idx" ON "app"."search_documents" USING pgroonga ("title","headings","body","metadata");