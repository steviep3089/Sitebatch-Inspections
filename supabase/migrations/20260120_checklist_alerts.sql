-- Checklist alerts for admins when issues are found during completion

create table if not exists public.checklist_alerts (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.inspection_checklists(id) on delete cascade,
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade,
  created_by uuid references auth.users(id),
  issue_summary text,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

create index if not exists idx_checklist_alerts_admin
  on public.checklist_alerts (admin_id, is_resolved, created_at);

alter table public.checklist_alerts enable row level security;

create policy "Users can insert checklist alerts they create" on public.checklist_alerts
  for insert to authenticated
  with check (created_by = auth.uid());

create policy "Admins can view their checklist alerts" on public.checklist_alerts
  for select to authenticated
  using (admin_id = auth.uid() or created_by = auth.uid());

create policy "Admins can update their checklist alerts" on public.checklist_alerts
  for update to authenticated
  using (admin_id = auth.uid());
