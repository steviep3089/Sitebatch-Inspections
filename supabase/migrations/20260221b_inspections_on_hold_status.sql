alter table public.inspections
  add column if not exists hold_reason text;

alter table public.inspections
  drop constraint if exists inspections_status_check;

alter table public.inspections
  add constraint inspections_status_check
  check (status in ('pending', 'completed', 'overdue', 'cancelled', 'on_hold'));