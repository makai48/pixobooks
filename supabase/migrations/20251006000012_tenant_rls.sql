-- Multi-tenancy Phase 1b-2: row-level security for tenant tables.
--
-- RUN ONLY AFTER 20251006000011 has been applied, every client write sets
-- business_id, and the updated app is deployed. This migration intentionally
-- REPLACES all existing policies on these tables, so review it against the
-- live policies (Supabase Dashboard -> Authentication -> Policies or
-- select * from pg_policies) before running.
--
-- Isolation model:
--   * business-scoped read for members; privileged (owner/manager) see all.
--   * branch-scoped read for non-privileged members when the table has a
--     branch_id: their branch plus any null (shared/legacy) rows.
--   * writes require membership; settings/branches require privileged.
--   * user_profiles stays global; visible to self + co-members only.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- Helpers for the global profiles table. SECURITY DEFINER so they can read
-- memberships regardless of the caller's RLS.
create or replace function public.shares_business(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members me
    join public.business_members them on them.business_id = me.business_id
    where me.user_id = auth.uid() and them.user_id = target
  );
$$;

create or replace function public.can_manage_member(target uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members me
    join public.business_members them on them.business_id = me.business_id
    where me.user_id = auth.uid()
      and me.role in ('owner', 'manager')
      and them.user_id = target
  );
$$;

grant execute on function public.shares_business(uuid) to authenticated;
grant execute on function public.can_manage_member(uuid) to authenticated;

do $$
declare
  t text;
  has_branch boolean;
  read_pred text;
  pol record;

  -- Full member read + write. Branch restriction applies when branch_id exists.
  standard_tables text[] := array[
    'attendance',
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

  -- Members can read; only owners/managers can change.
  write_privileged_tables text[] := array['branches', 'shop_settings'];

  -- Owners/managers only. Audit/backup data must not leak to staff.
  privileged_read_tables text[] := array[
    'audit_logs',
    'backups',
    'password_reset_requests'
  ];
begin
  -- Standard tenant tables -------------------------------------------------
  foreach t in array standard_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;
    if not exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'business_id'
    ) then
      raise notice 'Skipping RLS for % (no business_id)', t;
      continue;
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    select exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = t
        and column_name = 'branch_id'
    ) into has_branch;

    if has_branch then
      read_pred := 'public.is_member(business_id) and '
        || '(public.is_privileged(business_id) or branch_id is null '
        || 'or branch_id = public.member_branch(business_id))';
    else
      read_pred := 'public.is_member(business_id)';
    end if;

    execute format(
      'create policy %I on public.%I for select to authenticated using (%s)',
      t || '_tenant_read', t, read_pred
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (public.is_member(business_id))',
      t || '_tenant_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (%s) with check (public.is_member(business_id))',
      t || '_tenant_update', t, read_pred
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (public.is_member(business_id))',
      t || '_tenant_delete', t
    );
  end loop;

  -- Member read, privileged write -----------------------------------------
  foreach t in array write_privileged_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.is_member(business_id))',
      t || '_tenant_read', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (public.is_privileged(business_id))',
      t || '_tenant_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (public.is_privileged(business_id)) '
      || 'with check (public.is_privileged(business_id))',
      t || '_tenant_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (public.is_privileged(business_id))',
      t || '_tenant_delete', t
    );
  end loop;

  -- Privileged read, member insert ----------------------------------------
  foreach t in array privileged_read_tables loop
    if to_regclass('public.' || t) is null then
      continue;
    end if;

    for pol in
      select policyname from pg_policies
      where schemaname = 'public' and tablename = t
    loop
      execute format('drop policy %I on public.%I', pol.policyname, t);
    end loop;

    execute format('alter table public.%I enable row level security', t);

    execute format(
      'create policy %I on public.%I for select to authenticated '
      || 'using (public.is_privileged(business_id))',
      t || '_tenant_read', t
    );
    execute format(
      'create policy %I on public.%I for insert to authenticated '
      || 'with check (public.is_member(business_id))',
      t || '_tenant_insert', t
    );
    execute format(
      'create policy %I on public.%I for update to authenticated '
      || 'using (public.is_privileged(business_id)) '
      || 'with check (public.is_privileged(business_id))',
      t || '_tenant_update', t
    );
    execute format(
      'create policy %I on public.%I for delete to authenticated '
      || 'using (public.is_privileged(business_id))',
      t || '_tenant_delete', t
    );
  end loop;
end $$;

-- Account approvals: a pending user must be able to create and see their own
-- request before they belong to the business; owners/managers review the rest.
-- REVIEW: the signup trigger / invite edge function must stamp business_id.
do $$
declare
  pol record;
begin
  if to_regclass('public.account_approval_requests') is null then
    return;
  end if;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'account_approval_requests'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, 'account_approval_requests');
  end loop;

  execute 'alter table public.account_approval_requests enable row level security';

  execute 'create policy "account_approval_requests_self_or_privileged_read" '
    || 'on public.account_approval_requests for select to authenticated '
    || 'using (user_id = auth.uid() or public.is_privileged(business_id))';

  execute 'create policy "account_approval_requests_self_insert" '
    || 'on public.account_approval_requests for insert to authenticated '
    || 'with check (public.is_member(business_id) '
    || 'or (business_id is null and user_id = auth.uid()))';

  execute 'create policy "account_approval_requests_privileged_update" '
    || 'on public.account_approval_requests for update to authenticated '
    || 'using (public.is_privileged(business_id)) '
    || 'with check (public.is_privileged(business_id))';

  execute 'create policy "account_approval_requests_privileged_delete" '
    || 'on public.account_approval_requests for delete to authenticated '
    || 'using (public.is_privileged(business_id))';
end $$;

-- Profiles are global (a user can belong to several businesses). Replace the
-- existing policies so profiles are visible only to self + co-members.
-- REVIEW: verify the owner-role trigger still blocks self role escalation.
do $$
declare
  pol record;
begin
  if to_regclass('public.user_profiles') is null then
    return;
  end if;

  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
  loop
    execute format('drop policy %I on public.%I', pol.policyname, 'user_profiles');
  end loop;

  execute 'alter table public.user_profiles enable row level security';

  execute 'create policy "profiles_self_or_comember_read" '
    || 'on public.user_profiles for select to authenticated '
    || 'using (id = auth.uid() or public.shares_business(id))';

  execute 'create policy "profiles_self_update" '
    || 'on public.user_profiles for update to authenticated '
    || 'using (id = auth.uid()) with check (id = auth.uid())';

  execute 'create policy "profiles_manager_update" '
    || 'on public.user_profiles for update to authenticated '
    || 'using (public.can_manage_member(id)) '
    || 'with check (public.can_manage_member(id))';
end $$;
