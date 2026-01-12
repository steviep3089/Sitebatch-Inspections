-- Inspection item templates define the individual things that should be
-- checked for a given inspection type (and optionally per asset).

create table if not exists public.inspection_item_templates (
  id uuid primary key default gen_random_uuid(),
  inspection_type_id uuid not null references public.inspection_types(id) on delete cascade,
  asset_id uuid references public.asset_items(id) on delete cascade,
  name text not null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- A checklist is a concrete instance of templates for a specific
-- inspection on a specific asset, optionally assigned to a user.

create table if not exists public.inspection_checklists (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references public.inspections(id) on delete cascade,
  asset_id uuid not null references public.asset_items(id) on delete cascade,
  inspection_type_id uuid not null references public.inspection_types(id) on delete cascade,
  assigned_user_id uuid references auth.users(id),
  status text not null default 'draft', -- draft | sent | in_progress | completed
  due_date date,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Items belonging to a specific checklist. We copy the label from the
-- template so history remains stable even if templates change later.

create table if not exists public.inspection_checklist_items (
  id uuid primary key default gen_random_uuid(),
  checklist_id uuid not null references public.inspection_checklists(id) on delete cascade,
  template_id uuid references public.inspection_item_templates(id) on delete set null,
  label text not null,
  status text not null default 'not_checked', -- not_checked | inspected | not_available | defective
  comments text,
  photo_url text,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  created_by uuid references auth.users(id)
);

-- Basic indexes to keep lookups fast.

create index if not exists idx_inspection_item_templates_type_asset
  on public.inspection_item_templates (inspection_type_id, asset_id);

create index if not exists idx_inspection_checklists_inspection
  on public.inspection_checklists (inspection_id);

create index if not exists idx_inspection_checklist_items_checklist
  on public.inspection_checklist_items (checklist_id);
