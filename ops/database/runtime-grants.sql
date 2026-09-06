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
