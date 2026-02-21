alter table public.inspections
  add column if not exists recurrence_group_id uuid,
  add column if not exists recurrence_sequence integer,
  add column if not exists recurrence_frequency_months integer;

create index if not exists idx_inspections_recurrence_group
  on public.inspections(recurrence_group_id, recurrence_sequence);
