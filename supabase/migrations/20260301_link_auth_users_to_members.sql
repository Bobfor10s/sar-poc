-- Migration 3: Link auth users to members
-- Adds FK constraint from members.user_id → auth.users(id)
-- ON DELETE SET NULL so deleting an auth user unlinks but does not delete the member row

ALTER TABLE public.members
  ADD CONSTRAINT members_user_id_fkey
  FOREIGN KEY (user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- Index for fast lookup by user_id (used in getAuthContext on every authenticated request)
CREATE INDEX IF NOT EXISTS members_user_id_idx ON public.members(user_id);
