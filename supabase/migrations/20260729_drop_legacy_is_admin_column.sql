-- Legacy boolean superseded by members.role + the RBAC role_permissions system.
-- Zero references anywhere in application code; only Bob's row had it set true,
-- while other admin-role members (Scott Baker, Claude Jaillet, Will Test) had
-- it false, confirming it was dead and inconsistent with actual access.
ALTER TABLE members DROP COLUMN IF EXISTS is_admin;
