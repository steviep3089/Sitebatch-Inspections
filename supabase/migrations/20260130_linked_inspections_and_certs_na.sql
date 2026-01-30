-- Add linked inspection grouping and certs N/A flag

alter table public.inspections
  add column if not exists linked_group_id uuid,
  add column if not exists certs_na boolean not null default false;

create index if not exists idx_inspections_linked_group_id
  on public.inspections (linked_group_id);
