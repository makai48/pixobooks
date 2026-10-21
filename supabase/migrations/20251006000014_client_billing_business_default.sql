-- Client billing: auto-stamp business_id on inserts.
--
-- 20251006000013 made business_id NOT NULL on the client_* tables, but the
-- client billing writes (app + generate-monthly-invoices edge function) do not
-- send business_id. This adds a default that resolves the caller's business,
-- falling back to the oldest business for service-role/cron writes.
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
  t text;
begin
  foreach t in array array[
    'client_accounts',
    'client_services',
    'client_work_entries',
    'client_billing_periods',
    'client_invoices',
    'client_invoice_payments',
    'audit_logs'
  ] loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = t
        and column_name = 'business_id'
    ) then
      execute format(
        'alter table public.%I alter column business_id set default public.pixo_default_business_id()',
        t
      );
    end if;
  end loop;
end $$;
