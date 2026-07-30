-- The member role had manage_calls granted, letting a plain member create/close
-- calls and edit anyone's attendance via direct API calls (the UI masked this
-- by gating the Add Call button on role==='admin' rather than the permission,
-- so it wasn't visible, but the API itself allowed it). manage_calls is
-- documented in docs/architecture.md as admin-only.
DELETE FROM role_permissions
WHERE permission_key = 'manage_calls'
AND role_id = (SELECT id FROM roles WHERE name = 'member');
