CREATE SCHEMA "health";
--> statement-breakpoint
CREATE TYPE "app"."measurement_time_precision" AS ENUM('date', 'datetime');--> statement-breakpoint
CREATE TYPE "app"."measurement_source" AS ENUM('manual_legacy', 'manual', 'smartscale');--> statement-breakpoint
CREATE TABLE "app"."body_measurements" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"measured_at" timestamp with time zone NOT NULL,
	"time_precision" "app"."measurement_time_precision" NOT NULL,
	"source" "app"."measurement_source" NOT NULL,
	"source_record_key" text,
	"weight" numeric,
	"bmi" numeric,
	"body_fat" numeric,
	"body_water" numeric,
	"muscle_mass" numeric,
	"skeletal_muscle_mass" numeric,
	"bone_mass" numeric,
	"protein_mass" numeric,
	"visceral_fat" numeric,
	"heart_rate" numeric,
	"basal_metabolism" numeric,
	"metabolic_age" numeric,
	"physique_rating" numeric,
	"body_score" numeric,
	"height" numeric,
	"waist" numeric,
	"note" text,
	"excluded" boolean DEFAULT false NOT NULL,
	"raw_payload" jsonb,
	"revision" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "body_measurements_weight_range" CHECK ("app"."body_measurements"."weight" IS NULL OR "app"."body_measurements"."weight" BETWEEN 1 AND 500),
	CONSTRAINT "body_measurements_bmi_range" CHECK ("app"."body_measurements"."bmi" IS NULL OR "app"."body_measurements"."bmi" BETWEEN 1 AND 150),
	CONSTRAINT "body_measurements_bodyFat_range" CHECK ("app"."body_measurements"."body_fat" IS NULL OR "app"."body_measurements"."body_fat" BETWEEN 0 AND 100),
	CONSTRAINT "body_measurements_bodyWater_range" CHECK ("app"."body_measurements"."body_water" IS NULL OR "app"."body_measurements"."body_water" BETWEEN 0 AND 100),
	CONSTRAINT "body_measurements_muscleMass_range" CHECK ("app"."body_measurements"."muscle_mass" IS NULL OR "app"."body_measurements"."muscle_mass" BETWEEN 0 AND 400),
	CONSTRAINT "body_measurements_skeletalMuscleMass_range" CHECK ("app"."body_measurements"."skeletal_muscle_mass" IS NULL OR "app"."body_measurements"."skeletal_muscle_mass" BETWEEN 0 AND 400),
	CONSTRAINT "body_measurements_boneMass_range" CHECK ("app"."body_measurements"."bone_mass" IS NULL OR "app"."body_measurements"."bone_mass" BETWEEN 0 AND 50),
	CONSTRAINT "body_measurements_proteinMass_range" CHECK ("app"."body_measurements"."protein_mass" IS NULL OR "app"."body_measurements"."protein_mass" BETWEEN 0 AND 200),
	CONSTRAINT "body_measurements_visceralFat_range" CHECK ("app"."body_measurements"."visceral_fat" IS NULL OR "app"."body_measurements"."visceral_fat" BETWEEN 0 AND 100),
	CONSTRAINT "body_measurements_heartRate_range" CHECK ("app"."body_measurements"."heart_rate" IS NULL OR "app"."body_measurements"."heart_rate" BETWEEN 1 AND 300),
	CONSTRAINT "body_measurements_basalMetabolism_range" CHECK ("app"."body_measurements"."basal_metabolism" IS NULL OR "app"."body_measurements"."basal_metabolism" BETWEEN 1 AND 10000),
	CONSTRAINT "body_measurements_metabolicAge_range" CHECK ("app"."body_measurements"."metabolic_age" IS NULL OR "app"."body_measurements"."metabolic_age" BETWEEN 1 AND 150),
	CONSTRAINT "body_measurements_physiqueRating_range" CHECK ("app"."body_measurements"."physique_rating" IS NULL OR "app"."body_measurements"."physique_rating" BETWEEN 0 AND 100),
	CONSTRAINT "body_measurements_bodyScore_range" CHECK ("app"."body_measurements"."body_score" IS NULL OR "app"."body_measurements"."body_score" BETWEEN 0 AND 100),
	CONSTRAINT "body_measurements_height_range" CHECK ("app"."body_measurements"."height" IS NULL OR "app"."body_measurements"."height" BETWEEN 20 AND 300),
	CONSTRAINT "body_measurements_waist_range" CHECK ("app"."body_measurements"."waist" IS NULL OR "app"."body_measurements"."waist" BETWEEN 10 AND 400),
	CONSTRAINT "body_measurements_source_identity" CHECK (("app"."body_measurements"."source" = 'manual' AND "app"."body_measurements"."source_record_key" IS NULL) OR ("app"."body_measurements"."source" <> 'manual' AND "app"."body_measurements"."source_record_key" IS NOT NULL AND length("app"."body_measurements"."source_record_key") > 0)),
	CONSTRAINT "body_measurements_revision_nonnegative" CHECK ("app"."body_measurements"."revision" >= 0),
	CONSTRAINT "body_measurements_date_precision" CHECK ("app"."body_measurements"."time_precision" <> 'date' OR ("app"."body_measurements"."measured_at" AT TIME ZONE 'Asia/Shanghai')::time = time '00:00:00'),
	CONSTRAINT "body_measurements_payload_object" CHECK ("app"."body_measurements"."raw_payload" IS NULL OR jsonb_typeof("app"."body_measurements"."raw_payload") = 'object'),
	CONSTRAINT "body_measurements_has_content" CHECK (num_nonnulls("app"."body_measurements"."weight", "app"."body_measurements"."bmi", "app"."body_measurements"."body_fat", "app"."body_measurements"."body_water", "app"."body_measurements"."muscle_mass", "app"."body_measurements"."skeletal_muscle_mass", "app"."body_measurements"."bone_mass", "app"."body_measurements"."protein_mass", "app"."body_measurements"."visceral_fat", "app"."body_measurements"."heart_rate", "app"."body_measurements"."basal_metabolism", "app"."body_measurements"."metabolic_age", "app"."body_measurements"."physique_rating", "app"."body_measurements"."body_score", "app"."body_measurements"."height", "app"."body_measurements"."waist") > 0 OR COALESCE(length(trim("app"."body_measurements"."note")), 0) > 0)
);
--> statement-breakpoint
CREATE TABLE "health"."legacy_snapshots" (
	"revision" bigint PRIMARY KEY NOT NULL,
	"payload" jsonb NOT NULL,
	"sha256" text NOT NULL,
	"migrated_count" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "health"."plan_overrides" (
	"date" date PRIMARY KEY NOT NULL,
	"target_min" numeric NOT NULL,
	"target_max" numeric NOT NULL,
	CONSTRAINT "health_plan_range" CHECK ("health"."plan_overrides"."target_min" <= "health"."plan_overrides"."target_max")
);
--> statement-breakpoint
CREATE TABLE "health"."state" (
	"id" text PRIMARY KEY NOT NULL,
	"revision" integer DEFAULT 0 NOT NULL,
	"last_success_at" timestamp with time zone,
	"source_updated_at" timestamp with time zone,
	"source_hash" text,
	"last_error" text
);
--> statement-breakpoint
CREATE UNIQUE INDEX "body_measurements_source_key_unique" ON "app"."body_measurements" USING btree ("source","source_record_key");--> statement-breakpoint
CREATE INDEX "body_measurements_time_idx" ON "app"."body_measurements" USING btree ("measured_at","id");--> statement-breakpoint
ALTER TABLE app.body_measurements ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY body_owner ON app.body_measurements TO site_control_api USING (true) WITH CHECK (true);
--> statement-breakpoint
CREATE POLICY body_worker_read ON app.body_measurements FOR SELECT TO site_content_worker USING (source = 'smartscale');
--> statement-breakpoint
CREATE POLICY body_worker_insert ON app.body_measurements FOR INSERT TO site_content_worker WITH CHECK (source = 'smartscale' AND note IS NULL AND excluded = false);
--> statement-breakpoint
CREATE POLICY body_worker_update ON app.body_measurements FOR UPDATE TO site_content_worker USING (source = 'smartscale') WITH CHECK (source = 'smartscale');
--> statement-breakpoint
ALTER TABLE app.owner_managed_datasets ENABLE ROW LEVEL SECURITY;
--> statement-breakpoint
CREATE POLICY datasets_public ON app.owner_managed_datasets TO site_app USING (dataset_key <> 'weight_loss');
--> statement-breakpoint
CREATE POLICY datasets_control ON app.owner_managed_datasets TO site_control_api, site_content_worker USING (true) WITH CHECK (true);
--> statement-breakpoint
INSERT INTO health.state (id) VALUES ('owner');
--> statement-breakpoint
CREATE VIEW app.weight_loss_private_compat WITH (security_invoker = true) AS
SELECT jsonb_build_object('version', 2, 'records', COALESCE((
  SELECT jsonb_agg(jsonb_build_object(
    'date', d.date::text, 'targetMin', COALESCE(p.target_min, 74.5), 'targetMax', COALESCE(p.target_max, 75.5),
    'weight', COALESCE(m.weight::text, ''), 'bodyFat', COALESCE(m.body_fat::text, ''),
    'muscleMass', COALESCE(m.muscle_mass::text, ''), 'waist', COALESCE(m.waist::text, ''), 'note', COALESCE(m.note, '')
  ) ORDER BY d.date)
  FROM (SELECT date FROM (SELECT date FROM health.plan_overrides UNION SELECT (measured_at AT TIME ZONE 'Asia/Shanghai')::date FROM app.body_measurements) days ORDER BY date DESC LIMIT 256) d
  LEFT JOIN health.plan_overrides p ON p.date = d.date
  LEFT JOIN LATERAL (
    SELECT * FROM app.body_measurements b
    WHERE (b.measured_at AT TIME ZONE 'Asia/Shanghai')::date = d.date AND NOT b.excluded
    ORDER BY b.measured_at DESC, b.id DESC LIMIT 1
  ) m ON true
), '[]'::jsonb)) AS payload, s.revision
FROM health.state s WHERE s.id = 'owner';
--> statement-breakpoint
REVOKE ALL ON app.weight_loss_private_compat FROM PUBLIC, site_app, site_content_worker;
--> statement-breakpoint
GRANT SELECT ON app.weight_loss_private_compat TO site_control_api;
--> statement-breakpoint
CREATE FUNCTION health.freeze_legacy_weight() RETURNS trigger
LANGUAGE plpgsql SECURITY DEFINER SET search_path = pg_catalog AS $$
BEGIN
  IF OLD.dataset_key = 'weight_loss' AND EXISTS (SELECT 1 FROM health.legacy_snapshots) THEN
    RAISE EXCEPTION 'health_migrated' USING ERRCODE = '55000';
  END IF;
  RETURN CASE WHEN TG_OP = 'DELETE' THEN OLD ELSE NEW END;
END;
$$;
--> statement-breakpoint
REVOKE ALL ON FUNCTION health.freeze_legacy_weight() FROM PUBLIC;
--> statement-breakpoint
CREATE TRIGGER freeze_legacy_weight BEFORE UPDATE OR DELETE ON app.owner_managed_datasets
FOR EACH ROW EXECUTE FUNCTION health.freeze_legacy_weight();
--> statement-breakpoint
DO $health_grants$
BEGIN
  IF to_regclass('app.body_measurements') IS NOT NULL THEN
    REVOKE ALL ON app.weight_loss_private_compat FROM PUBLIC, site_app, site_content_worker;
    REVOKE ALL ON app.body_measurements FROM PUBLIC, site_app, site_content_worker;
    GRANT SELECT, INSERT, UPDATE, DELETE ON app.body_measurements TO site_control_api;
    GRANT SELECT, INSERT ON app.body_measurements TO site_content_worker;
    GRANT UPDATE (measured_at, time_precision, weight, bmi, body_fat, body_water, muscle_mass,
      skeletal_muscle_mass, bone_mass, protein_mass, visceral_fat, heart_rate, basal_metabolism,
      metabolic_age, physique_rating, body_score, height, waist, raw_payload, revision, updated_at)
      ON app.body_measurements TO site_content_worker;
    REVOKE ALL ON SCHEMA health FROM PUBLIC;
    GRANT USAGE ON SCHEMA health TO site_control_api, site_content_worker, site_backup;
    GRANT SELECT, INSERT, UPDATE, DELETE ON health.plan_overrides, health.state TO site_control_api;
    GRANT SELECT, UPDATE ON health.state TO site_content_worker;
    GRANT SELECT ON ALL TABLES IN SCHEMA health TO site_backup;
    REVOKE ALL ON health.legacy_snapshots FROM site_app, site_content_worker, site_control_api;
  END IF;
END
$health_grants$;
