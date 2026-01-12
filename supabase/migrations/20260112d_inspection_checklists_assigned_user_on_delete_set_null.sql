-- Allow deleting auth users even if they are referenced as
-- assigned_user_id on inspection_checklists by setting that
-- column to NULL instead of blocking the delete.

ALTER TABLE public.inspection_checklists
  DROP CONSTRAINT IF EXISTS inspection_checklists_assigned_user_id_fkey;

ALTER TABLE public.inspection_checklists
  ADD CONSTRAINT inspection_checklists_assigned_user_id_fkey
  FOREIGN KEY (assigned_user_id)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;