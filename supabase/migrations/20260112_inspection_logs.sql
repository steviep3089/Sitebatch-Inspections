-- Logs for inspection-level activity over time

create table if not exists public.inspection_logs (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  action text not null,
  details text,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create index if not exists idx_inspection_logs_inspection
  on public.inspection_logs (inspection_id, created_at);
