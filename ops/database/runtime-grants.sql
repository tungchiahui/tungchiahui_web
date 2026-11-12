REVOKE ALL ON SCHEMA app FROM PUBLIC;
GRANT USAGE ON SCHEMA app TO site_app, site_content_worker, site_control_api, site_backup;
GRANT SELECT ON ALL TABLES IN SCHEMA app TO site_app, site_backup;
GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA app TO site_content_worker;
GRANT SELECT, INSERT ON app.operational_jobs TO site_control_api;
GRANT UPDATE (status, finished_at, error_summary) ON app.operational_jobs TO site_control_api;
GRANT SELECT ON app.documents TO site_control_api;
GRANT SELECT, INSERT ON app.translation_jobs TO site_control_api;
GRANT UPDATE (status, finished_at, cancel_requested_at) ON app.translation_jobs TO site_control_api;
GRANT SELECT, INSERT, UPDATE ON app.owner_managed_datasets TO site_control_api;
GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA app TO site_content_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE site_migrator IN SCHEMA app
  GRANT SELECT ON TABLES TO site_app, site_backup;
ALTER DEFAULT PRIVILEGES FOR ROLE site_migrator IN SCHEMA app
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO site_content_worker;
ALTER DEFAULT PRIVILEGES FOR ROLE site_migrator IN SCHEMA app
  GRANT USAGE, SELECT ON SEQUENCES TO site_content_worker;
REVOKE ALL ON SCHEMA drizzle FROM PUBLIC;
DO $git_memory_grants$
BEGIN
  IF to_regclass('app.content_source_files') IS NOT NULL THEN
    REVOKE ALL ON app.content_source_files, app.content_sync_state, app.git_translation_entries FROM site_app, site_control_api;
  END IF;
  IF to_regclass('app.document_translation_fields') IS NOT NULL THEN
    REVOKE ALL ON app.document_translation_fields FROM site_app, site_control_api;
  END IF;
END
$git_memory_grants$;
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
