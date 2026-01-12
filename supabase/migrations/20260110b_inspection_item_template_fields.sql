-- Add explicit fields for inspection item templates so we can
-- capture unique identification, description and capacity.

alter table public.inspection_item_templates
  add column if not exists unique_id text,
  add column if not exists description text,
  add column if not exists capacity text,
  add column if not exists capacity_na boolean not null default false;
