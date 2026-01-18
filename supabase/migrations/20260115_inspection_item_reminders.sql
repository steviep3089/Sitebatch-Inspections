-- Reminder tracking for inspection item expiry emails.

create table if not exists public.inspection_item_reminders (
  id uuid primary key default gen_random_uuid(),
  template_id uuid not null references public.inspection_item_templates(id) on delete cascade,
  reminder_type text not null default 'due', -- due | overdue
  reminder_date date not null,
  days_before integer,
  sent boolean not null default false,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_item_reminders_template
  on public.inspection_item_reminders (template_id, reminder_type, days_before);

create index if not exists idx_item_reminders_date
  on public.inspection_item_reminders (reminder_date);

alter table public.inspection_item_reminders enable row level security;

create policy "Allow authenticated users to read item reminders"
  on public.inspection_item_reminders for select
  to authenticated using (true);
