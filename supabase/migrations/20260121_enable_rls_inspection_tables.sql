-- Enable RLS and add policies for inspection-related tables flagged by security checks

-- inspection_item_templates
alter table public.inspection_item_templates enable row level security;

create policy "Authenticated can view inspection item templates"
  on public.inspection_item_templates
  for select
  to authenticated
  using (true);

create policy "Admins can manage inspection item templates"
  on public.inspection_item_templates
  for all
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

-- inspection_checklists
alter table public.inspection_checklists enable row level security;

create policy "Users can view assigned checklists or admins can view all"
  on public.inspection_checklists
  for select
  to authenticated
  using (
    assigned_user_id = auth.uid()
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Admins can insert checklists"
  on public.inspection_checklists
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Users can update assigned checklists or admins can update all"
  on public.inspection_checklists
  for update
  to authenticated
  using (
    assigned_user_id = auth.uid()
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  )
  with check (
    assigned_user_id = auth.uid()
    or exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Admins can delete checklists"
  on public.inspection_checklists
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

-- inspection_checklist_items
alter table public.inspection_checklist_items enable row level security;

create policy "Users can view checklist items for assigned checklists or admins can view all"
  on public.inspection_checklist_items
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.inspection_checklists
      where id = inspection_checklist_items.checklist_id
        and (
          assigned_user_id = auth.uid()
          or exists (
            select 1
            from public.user_profiles
            where id = auth.uid()
              and role = 'admin'
          )
        )
    )
  );

create policy "Admins can insert checklist items"
  on public.inspection_checklist_items
  for insert
  to authenticated
  with check (
    exists (
      select 1
      from public.user_profiles
      where id = auth.uid()
        and role = 'admin'
    )
  );

create policy "Users can update checklist items for assigned checklists or admins can update all"
  on public.inspection_checklist_items
  for update
  to authenticated
  using (
    exists (
      select 1
      from public.inspection_checklists
      where id = inspection_checklist_items.checklist_id
        and (
          assigned_user_id = auth.uid()
          or exists (
            select 1
            from public.user_profiles
            where id = auth.uid()
              and role = 'admin'
          )
        )
    )
  )
  with check (
    exists (
      select 1
      from public.inspection_checklists
      where id = inspection_checklist_items.checklist_id
        and (
          assigned_user_id = auth.uid()
          or exists (
            select 1
            from public.user_profiles
            where id = auth.uid()
              and role = 'admin'
          )
        )
    )
  );

create policy "Admins can delete checklist items"
  on public.inspection_checklist_items
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

-- inspection_logs
alter table public.inspection_logs enable row level security;

create policy "Users can view logs for assigned inspections or admins can view all"
  on public.inspection_logs
  for select
  to authenticated
  using (
    exists (
      select 1
      from public.inspection_checklists
      where inspection_id = inspection_logs.inspection_id
        and (
          assigned_user_id = auth.uid()
          or exists (
            select 1
            from public.user_profiles
            where id = auth.uid()
              and role = 'admin'
          )
        )
    )
  );

create policy "Users can insert logs for assigned inspections or admins can insert all"
  on public.inspection_logs
  for insert
  to authenticated
  with check (
    created_by = auth.uid()
    and (
      exists (
        select 1
        from public.user_profiles
        where id = auth.uid()
          and role = 'admin'
      )
      or exists (
        select 1
        from public.inspection_checklists
        where inspection_id = inspection_logs.inspection_id
          and assigned_user_id = auth.uid()
      )
    )
  );

create policy "Admins can update logs"
  on public.inspection_logs
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

create policy "Admins can delete logs"
  on public.inspection_logs
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
