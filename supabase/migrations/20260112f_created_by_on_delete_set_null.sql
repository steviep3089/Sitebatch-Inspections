-- Allow deleting auth users even if they are referenced in generic created_by columns
-- by setting created_by to NULL instead of blocking the delete.

-- inspection_item_templates.created_by
ALTER TABLE public.inspection_item_templates
  DROP CONSTRAINT IF EXISTS inspection_item_templates_created_by_fkey;

ALTER TABLE public.inspection_item_templates
  ADD CONSTRAINT inspection_item_templates_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- inspection_checklists.created_by
ALTER TABLE public.inspection_checklists
  DROP CONSTRAINT IF EXISTS inspection_checklists_created_by_fkey;

ALTER TABLE public.inspection_checklists
  ADD CONSTRAINT inspection_checklists_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- inspection_checklist_items.created_by
ALTER TABLE public.inspection_checklist_items
  DROP CONSTRAINT IF EXISTS inspection_checklist_items_created_by_fkey;

ALTER TABLE public.inspection_checklist_items
  ADD CONSTRAINT inspection_checklist_items_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- inspection_logs.created_by
ALTER TABLE public.inspection_logs
  DROP CONSTRAINT IF EXISTS inspection_logs_created_by_fkey;

ALTER TABLE public.inspection_logs
  ADD CONSTRAINT inspection_logs_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;

-- asset_events.created_by
ALTER TABLE public.asset_events
  DROP CONSTRAINT IF EXISTS asset_events_created_by_fkey;

ALTER TABLE public.asset_events
  ADD CONSTRAINT asset_events_created_by_fkey
  FOREIGN KEY (created_by)
  REFERENCES auth.users(id)
  ON DELETE SET NULL;
