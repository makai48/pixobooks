-- Multi-tenancy Phase 1b-3: enforce business_id and per-business numbering.
--
-- RUN LAST, after 20251006000011/12 and after the updated client writes
-- business_id on every insert. NOT NULL will reject any write that forgets it.
--
-- Intentionally EXCLUDED until their triggers/edge functions are updated:
--   * shop_settings   (signup trigger creates id = 'main')
--   * branches        (head-office seeding trigger)
--   * account_approval_requests, password_reset_requests (service-role writes)
--   * attendance      (payroll edge function writes)
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

do $$
declare
  t text;
  missing bigint;

  -- Tables whose writes are all client-side and now send business_id.
  not_null_tables text[] := array[
    'audit_logs',
    'backups',
    'bank_deposits',
    'client_accounts',
    'client_billing_periods',
    'client_invoice_payments',
    'client_invoices',
    'client_services',
    'client_work_entries',
    'customers',
    'daily_balancing',
    'debt_invoices',
    'expenses',
    'held_tickets',
    'items',
    'loyalty_transactions',
    'purchase_orders',
    'quotes',
    'sale_payments',
    'sales',
    'standing_orders',
    'stock_adjustments',
    'suppliers',
    'unit_conversions',
    'uom_categories',
    'uoms'
  ];
begin
  foreach t in array not_null_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format(
      'select count(*) from public.%I where business_id is null', t
    ) into missing;

    if missing = 0 then
      execute format(
        'alter table public.%I alter column business_id set not null', t
      );
    else
      raise notice
        'NOT NULL skipped for % (% rows without business_id)', t, missing;
    end if;
  end loop;
end $$;

-- Per-business document numbering: drop the legacy global unique on
-- sales.number, then enforce uniqueness within a business.
do $$
declare
  c record;
begin
  if to_regclass('public.sales') is null then
    return;
  end if;

  for c in
    select conname
    from pg_constraint
    where conrelid = 'public.sales'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (number)'
  loop
    execute format('alter table public.sales drop constraint %I', c.conname);
    raise notice 'Dropped legacy global unique constraint %', c.conname;
  end loop;

  for c in
    select indexname
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'sales'
      and indexdef ilike 'create unique index%on public.sales using btree (number)%'
  loop
    execute format('drop index if exists public.%I', c.indexname);
    raise notice 'Dropped legacy global unique index %', c.indexname;
  end loop;

  if not exists (
    select 1
    from pg_indexes
    where schemaname = 'public'
      and tablename = 'sales'
      and indexname = 'sales_business_number_key'
  ) then
    execute
      'create unique index sales_business_number_key '
      || 'on public.sales (business_id, number)';
  end if;
end $$;
