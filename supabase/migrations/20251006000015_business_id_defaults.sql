-- Auto-stamp business_id on every tenant table.
--
-- 20251006000012 enabled business-scoped RLS and 20251006000013 made
-- business_id NOT NULL, but the app does not send business_id on inserts
-- (POS sales, sale payments, loyalty, attendance, clients, …). Without a
-- default those inserts are NULL and fail the insert policy:
--   new row violates row-level security policy for table "sales" (42501)
--
-- This installs public.pixo_default_business_id() (caller's business, or the
-- oldest business for service-role/cron) and makes it the column default on
-- every public table that has business_id, except business_members (membership
-- rows must always carry an explicit business_id).
--
-- Safe to re-run.

create or replace function public.pixo_default_business_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (
      select bm.business_id
      from public.business_members bm
      where bm.user_id = auth.uid()
      order by bm.created_at
      limit 1
    ),
    (
      select b.id
      from public.businesses b
      order by b.created_at
      limit 1
    )
  );
$$;

grant execute on function public.pixo_default_business_id()
  to authenticated, service_role;

do $$
declare
  r record;
begin
  for r in
    select c.table_name
    from information_schema.columns c
    join information_schema.tables tb
      on tb.table_schema = c.table_schema
     and tb.table_name = c.table_name
    where c.table_schema = 'public'
      and c.column_name = 'business_id'
      and tb.table_type = 'BASE TABLE'
      and c.table_name <> 'business_members'
  loop
    execute format(
      'alter table public.%I alter column business_id set default public.pixo_default_business_id()',
      r.table_name
    );
  end loop;
end $$;
