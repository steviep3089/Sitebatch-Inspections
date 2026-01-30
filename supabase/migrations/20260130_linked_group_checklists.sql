-- Link a single checklist across grouped inspections

alter table public.inspection_checklists
  add column if not exists linked_group_id uuid;

create index if not exists idx_inspection_checklists_linked_group
  on public.inspection_checklists (linked_group_id);
