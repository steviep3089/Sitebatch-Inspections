-- Add expiry date fields for inspection item templates.

alter table public.inspection_item_templates
  add column if not exists expiry_date date,
  add column if not exists expiry_na boolean not null default false;
