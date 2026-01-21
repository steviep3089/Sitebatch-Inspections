-- Add resolution tracking for checklist alerts

alter table public.checklist_alerts
  add column if not exists resolved_at timestamptz,
  add column if not exists resolved_by uuid references auth.users(id);

create table if not exists public.checklist_alert_resolutions (
  id uuid primary key default gen_random_uuid(),
  alert_id uuid not null references public.checklist_alerts(id) on delete cascade,
  checklist_item_id uuid not null references public.inspection_checklist_items(id) on delete cascade,
  resolution_text text not null,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_checklist_alert_resolutions_alert
  on public.checklist_alert_resolutions (alert_id, created_at);

alter table public.checklist_alert_resolutions enable row level security;

create policy "Admins can insert resolutions" on public.checklist_alert_resolutions
  for insert to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1 from public.checklist_alerts
      where id = checklist_alert_resolutions.alert_id
        and admin_id = auth.uid()
    )
  );

create policy "Admins can view their resolutions" on public.checklist_alert_resolutions
  for select to authenticated
  using (
    exists (
      select 1 from public.checklist_alerts
      where id = checklist_alert_resolutions.alert_id
        and admin_id = auth.uid()
    )
  );
