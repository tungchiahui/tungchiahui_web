import { writeFileSync } from 'node:fs'
import { techFootprintPayloadSchema } from '../../src/personal/contracts'
import { legacyRecordIdMap, migrateLegacyTechPayload } from '../../src/personal/legacy-migration'

const payload = techFootprintPayloadSchema.parse(
  migrateLegacyTechPayload({ version: 2, records: {} }),
)
const roadmap = JSON.stringify(payload.roadmap).replaceAll("'", "''")
const mapping = JSON.stringify(legacyRecordIdMap).replaceAll("'", "''")
writeFileSync(
  'drizzle/0009_tech_footprint_v3.sql',
  `-- Reviewed immutable V2 roadmap snapshot and deterministic stable-ID mapping.
-- The update is atomic; unknown legacy record keys fail closed without losing progress.
DO $$
DECLARE
  current_payload jsonb;
  old_key text;
  migrated_records jsonb := '{}'::jsonb;
  id_map jsonb := '${mapping}'::jsonb;
BEGIN
  SELECT payload INTO current_payload FROM app.owner_managed_datasets
    WHERE dataset_key = 'tech_footprint' FOR UPDATE;
  IF current_payload IS NULL THEN
    INSERT INTO app.owner_managed_datasets (dataset_key, payload, updated_by)
    VALUES ('tech_footprint', jsonb_build_object('version', 3, 'roadmap', '${roadmap}'::jsonb, 'records', '{}'::jsonb), 'tech-v3-migration');
  ELSIF current_payload->>'version' = '2' THEN
    IF jsonb_typeof(current_payload->'records') IS DISTINCT FROM 'object' THEN
      RAISE EXCEPTION 'Invalid V2 Tech records';
    END IF;
    FOR old_key IN SELECT jsonb_object_keys(current_payload->'records') LOOP
      IF NOT id_map ? old_key THEN
        RAISE EXCEPTION 'Unknown V2 Tech record key: %', old_key;
      END IF;
      migrated_records := migrated_records || jsonb_build_object(id_map->>old_key, current_payload->'records'->old_key);
    END LOOP;
    UPDATE app.owner_managed_datasets
      SET payload = jsonb_build_object('version', 3, 'roadmap', '${roadmap}'::jsonb, 'records', migrated_records),
          revision = revision + 1, updated_at = now(), updated_by = 'tech-v3-migration'
      WHERE dataset_key = 'tech_footprint';
  ELSIF current_payload->>'version' IS DISTINCT FROM '3' THEN
    RAISE EXCEPTION 'Unexpected Tech payload version';
  END IF;
END $$;\n`,
)
