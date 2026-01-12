-- User requests for non-admin users to ask admins to add/change items

create table if not exists public.user_requests (
  id uuid primary key default gen_random_uuid(),
  requester_id uuid not null references auth.users(id) on delete cascade,
  admin_id uuid not null references auth.users(id) on delete cascade,
  description text not null,
  is_resolved boolean not null default false,
  created_at timestamptz not null default now()
);

alter table public.user_requests enable row level security;

create policy "Users can insert their own requests" on public.user_requests
  for insert to authenticated
  with check (requester_id = auth.uid());

create policy "Users and admins can view relevant requests" on public.user_requests
  for select to authenticated
  using (requester_id = auth.uid() or admin_id = auth.uid());

create policy "Admins can update their requests" on public.user_requests
  for update to authenticated
  using (admin_id = auth.uid());
