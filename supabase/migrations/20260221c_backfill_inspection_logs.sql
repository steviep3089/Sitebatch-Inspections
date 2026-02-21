-- Backfill inspection logs for historical inspections created before logging was fully in place.

with created_backfill as (
  insert into public.inspection_logs (inspection_id, action, details, created_at)
  select
    i.id,
    'created',
    'Backfill: inspection existed before logging was enabled.',
    coalesce(i.created_at, now())
  from public.inspections i
  where not exists (
    select 1
    from public.inspection_logs l
    where l.inspection_id = i.id
      and l.action = 'created'
  )
  returning inspection_id
),
completed_backfill as (
  insert into public.inspection_logs (inspection_id, action, details, created_at)
  select
    i.id,
    'completed',
    'Backfill: inspection is already marked completed in inspections table.',
    coalesce(i.date_completed::timestamptz, i.completed_date::timestamptz, i.created_at, now())
  from public.inspections i
  where i.status = 'completed'
    and not exists (
      select 1
      from public.inspection_logs l
      where l.inspection_id = i.id
        and l.action = 'completed'
    )
  returning inspection_id
),
on_hold_backfill as (
  insert into public.inspection_logs (inspection_id, action, details, created_at)
  select
    i.id,
    'on_hold',
    coalesce(
      'Backfill: inspection is currently on hold. Reason: ' || nullif(i.hold_reason, ''),
      'Backfill: inspection is currently on hold.'
    ),
    now()
  from public.inspections i
  where i.status = 'on_hold'
    and not exists (
      select 1
      from public.inspection_logs l
      where l.inspection_id = i.id
        and l.action = 'on_hold'
    )
  returning inspection_id
),
cert_uploaded_backfill as (
  insert into public.inspection_logs (inspection_id, action, details, created_at)
  select
    i.id,
    'cert_uploaded',
    'Backfill: certificates already marked as received with a cert link.',
    coalesce(i.date_completed::timestamptz, i.completed_date::timestamptz, i.created_at, now())
  from public.inspections i
  where coalesce(i.certs_received, false) = true
    and nullif(i.certs_link, '') is not null
    and not exists (
      select 1
      from public.inspection_logs l
      where l.inspection_id = i.id
        and l.action = 'cert_uploaded'
    )
  returning inspection_id
)
select
  (select count(*) from created_backfill) as created_logs_inserted,
  (select count(*) from completed_backfill) as completed_logs_inserted,
  (select count(*) from on_hold_backfill) as on_hold_logs_inserted,
  (select count(*) from cert_uploaded_backfill) as cert_uploaded_logs_inserted;
