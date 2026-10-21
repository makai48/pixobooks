-- Multi-tenancy Phase 1b-1: tenant columns, default business + memberships,
-- and backfill. Additive and idempotent: adds nullable business_id columns to
-- the tables the client actually queries, seeds a default business from the
-- current shop, copies every profile into business_members, then stamps all
-- existing rows with that business id.
--
-- RUN THIS FIRST. It leaves business_id nullable on purpose so the current app
-- keeps working until the client starts sending business_id on every write.
-- RLS and NOT NULL follow in 20251006000012 / 20251006000013.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run
-- BEFORE go-live. Do not re-run after go-live: stragglers with a null
-- business_id would be stamped with the oldest business.
-- VERIFY BEFORE RUNNING:
--   * user_profiles.role values (owner/manager detection) and branch_id column
--   * shop_settings.shop_name / id = 'main'
--   * the tables below exist with the expected names.

do $$
declare
  t text;
  v_biz uuid;
  v_owner uuid;
  v_name text;

  -- Tables the client reads/writes directly (see src/**/.from(...) usage).
  tenant_tables text[] := array[
    'account_approval_requests',
    'attendance',
    'audit_logs',
    'backups',
    'bank_deposits',
    'branches',
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
    'password_reset_requests',
    'purchase_orders',
    'quotes',
    'sale_payments',
    'sales',
    'shop_settings',
    'standing_orders',
    'stock_adjustments',
    'suppliers',
    'unit_conversions',
    'uom_categories',
    'uoms'
  ];

  -- Master data gets a nullable branch_id: null = shared across the business,
  -- stamped = owned by that branch (master_scope = 'per_branch').
  master_tables text[] := array['items', 'customers', 'suppliers'];
begin
  -- 1. business_id column + index + FK on every tenant table ----------------
  foreach t in array tenant_tables loop
    if to_regclass('public.' || t) is null then
      raise notice 'Skipping % (table not found)', t;
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists business_id uuid', t
    );

    execute format(
      'create index if not exists %I on public.%I (business_id)',
      t || '_business_idx', t
    );

    if not exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f'
        and c.conrelid = to_regclass('public.' || t)
        and a.attname = 'business_id'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (business_id) '
        || 'references public.businesses (id) on delete cascade',
        t, t || '_business_fk'
      );
    end if;
  end loop;

  -- 2. branch_id on master data (shared vs per-branch hybrid) ---------------
  foreach t in array master_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I add column if not exists branch_id uuid', t
    );

    execute format(
      'create index if not exists %I on public.%I (business_id, branch_id)',
      t || '_biz_branch_idx', t
    );

    if to_regclass('public.branches') is not null and not exists (
      select 1
      from pg_constraint c
      join pg_attribute a
        on a.attrelid = c.conrelid and a.attnum = any (c.conkey)
      where c.contype = 'f'
        and c.conrelid = to_regclass('public.' || t)
        and a.attname = 'branch_id'
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (branch_id) '
        || 'references public.branches (id) on delete set null',
        t, t || '_branch_fk'
      );
    end if;
  end loop;

  -- 3. default business from the current single shop ------------------------
  if to_regclass('public.user_profiles') is not null then
    select p.id
      into v_owner
    from public.user_profiles p
    where lower(coalesce(p.role, '')) like '%owner%'
    order by p.created_at nulls last
    limit 1;

    if v_owner is null then
      select p.id
        into v_owner
      from public.user_profiles p
      order by p.created_at nulls last
      limit 1;
    end if;
  end if;

  select b.id into v_biz
  from public.businesses b
  order by b.created_at
  limit 1;

  if v_biz is null and v_owner is not null then
    if to_regclass('public.shop_settings') is not null then
      execute
        'select nullif(trim(shop_name), '''') from public.shop_settings '
        || 'where id = ''main'' limit 1'
        into v_name;
    end if;

    insert into public.businesses (name, owner_id)
    values (coalesce(v_name, 'My Business'), v_owner)
    returning id into v_biz;
  end if;

  -- 4. memberships for every existing profile ------------------------------
  if v_biz is not null and to_regclass('public.user_profiles') is not null then
    insert into public.business_members (business_id, user_id, role, branch_id)
    select
      v_biz,
      p.id,
      case
        when lower(coalesce(p.role, '')) like '%owner%' then 'owner'
        when lower(coalesce(p.role, '')) like '%manager%' then 'manager'
        else 'staff'
      end,
      p.branch_id
    from public.user_profiles p
    on conflict (business_id, user_id) do nothing;

    -- Guarantee the chosen owner is privileged even if their profile role
    -- string does not contain "owner".
    update public.business_members
       set role = 'owner'
     where business_id = v_biz and user_id = v_owner;
  end if;

  -- 5. backfill every tenant row -------------------------------------------
  if v_biz is not null then
    foreach t in array tenant_tables loop
      if to_regclass('public.' || t) is null then
        continue;
      end if;
      execute format(
        'update public.%I set business_id = $1 where business_id is null', t
      ) using v_biz;
    end loop;

    if to_regclass('public.shop_settings') is not null then
      execute
        'create unique index if not exists shop_settings_business_key '
        || 'on public.shop_settings (business_id) where business_id is not null';
    end if;
  else
    raise notice
      'No user_profiles/owner found: tenant columns left nullable and unbackfilled.';
  end if;
end $$;
