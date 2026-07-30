-- Drops 8 tables confirmed empty (0 rows), unreferenced in application code,
-- and absent from docs/architecture.md's documented schema. Superseded by the
-- current courses/member_certifications and positions/tasks qualification system.
DROP TABLE IF EXISTS resource_profile_requirements;
DROP TABLE IF EXISTS resource_profiles;
DROP TABLE IF EXISTS qualification_requirements;
DROP TABLE IF EXISTS member_qualifications;
DROP TABLE IF EXISTS qualification_types;
DROP TABLE IF EXISTS notification_log;
DROP TABLE IF EXISTS notification_queue;
DROP TABLE IF EXISTS member_private;
