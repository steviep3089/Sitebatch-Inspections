-- Migration: Add waiting_on_certs column to inspections table
alter table public.inspections
  add column if not exists waiting_on_certs boolean not null default false;
