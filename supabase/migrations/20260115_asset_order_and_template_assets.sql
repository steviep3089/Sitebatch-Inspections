-- Asset ordering + asset types
alter table public.asset_items
  add column if not exists sort_order integer default 0;

alter table public.asset_items
  add column if not exists asset_type text;

create index if not exists idx_asset_items_sort_order
  on public.asset_items (sort_order);

create index if not exists idx_asset_items_asset_type
  on public.asset_items (asset_type);

-- Template-to-asset associations (many-to-many)
create table if not exists public.inspection_item_template_assets (
  template_id uuid not null references public.inspection_item_templates(id) on delete cascade,
  asset_id uuid not null references public.asset_items(id) on delete cascade,
  created_at timestamptz not null default now(),
  primary key (template_id, asset_id)
);

create index if not exists idx_inspection_item_template_assets_asset
  on public.inspection_item_template_assets (asset_id);

alter table public.inspection_item_template_assets enable row level security;

create policy "Allow authenticated users to read template assets"
  on public.inspection_item_template_assets for select
  to authenticated using (true);

create policy "Allow authenticated users to insert template assets"
  on public.inspection_item_template_assets for insert
  to authenticated with check (true);

create policy "Allow authenticated users to delete template assets"
  on public.inspection_item_template_assets for delete
  to authenticated using (true);

-- Backfill existing single-asset templates into the new association table.
insert into public.inspection_item_template_assets (template_id, asset_id)
select id, asset_id
from public.inspection_item_templates
where asset_id is not null
on conflict do nothing;
