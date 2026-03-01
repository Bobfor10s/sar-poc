-- Add hours column to member_task_signoffs
-- Tracks how long a member practiced a specific skill during a call or training session
ALTER TABLE public.member_task_signoffs
  ADD COLUMN hours numeric(5,2) NULL;
