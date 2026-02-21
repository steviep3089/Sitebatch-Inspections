-- Fix inspection log visibility/inserts for inspections that do not have checklists.
-- Previous policy depended on inspection_checklists existence, which hid logs unexpectedly.

alter table public.inspection_logs enable row level security;

drop policy if exists "Users can view logs for assigned inspections or admins can view all"
  on public.inspection_logs;

drop policy if exists "Users can insert logs for assigned inspections or admins can insert all"
  on public.inspection_logs;

create policy "Authenticated can view inspection logs"
  on public.inspection_logs
  for select
  to authenticated
  using (true);

create policy "Authenticated can insert own inspection logs"
  on public.inspection_logs
  for insert
  to authenticated
  with check (created_by = auth.uid());
