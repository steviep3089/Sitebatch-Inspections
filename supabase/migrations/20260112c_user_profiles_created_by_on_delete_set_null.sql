-- Allow deleting auth users even if they are referenced in user_profiles.created_by
-- by setting created_by to NULL instead of blocking the delete.

ALTER TABLE public.user_profiles
  DROP CONSTRAINT IF EXISTS user_profiles_created_by_fkey;

ALTER TABLE public.user_profiles
  ADD CONSTRAINT user_profiles_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;