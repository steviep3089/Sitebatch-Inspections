-- Allow authenticated users to delete inspections and reminders.
drop policy if exists "Allow authenticated users to delete inspections"
  on public.inspections;

create policy "Allow authenticated users to delete inspections"
  on public.inspections for delete
  to authenticated using (true);

drop policy if exists "Allow authenticated users to delete inspection_reminders"
  on public.inspection_reminders;

create policy "Allow authenticated users to delete inspection_reminders"
  on public.inspection_reminders for delete
  to authenticated using (true);
