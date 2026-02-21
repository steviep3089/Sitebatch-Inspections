create table if not exists public.report_recipients (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

create unique index if not exists idx_report_recipients_email_lower
  on public.report_recipients (lower(email));

alter table public.report_recipients enable row level security;

drop policy if exists "Admins can view report recipients" on public.report_recipients;
drop policy if exists "Admins can insert report recipients" on public.report_recipients;
drop policy if exists "Admins can update report recipients" on public.report_recipients;
drop policy if exists "Admins can delete report recipients" on public.report_recipients;

create policy "Admins can view report recipients"
  on public.report_recipients
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Admins can insert report recipients"
  on public.report_recipients
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Admins can update report recipients"
  on public.report_recipients
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
  with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Admins can delete report recipients"
  on public.report_recipients
  for delete
  to authenticated
  using (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );
