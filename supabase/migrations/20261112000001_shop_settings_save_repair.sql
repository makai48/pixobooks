-- Fix: saving Settings fails with
--   new row violates row-level security policy for table "shop_settings" (42501)
--
-- ROOT CAUSE
-- ----------
-- 1. The app mirrors a team member's profile role into `business_members.role`.
--    `useEmployees.membershipRole()` writes `'admin'` for the Admin tier, but
--    `public.is_privileged()` only accepted `('owner', 'manager')`. An Admin
--    could open Settings (the UI checks `user_profiles.role`) yet every write
--    to `shop_settings` / `branches` was rejected by RLS.
-- 2. The save path used `upsert`, which runs the INSERT policy's WITH CHECK
--    against the proposed row even when the row already exists. A legacy
--    `id = 'main'` row whose `business_id` was never backfilled (or a stale
--    active-workspace id) therefore failed the check during an UPDATE.
-- 3. A business could have no membership row for its creator, so
--    `is_privileged()` was false for the actual owner.
--
-- FIX
-- ---
--  * Treat the business owner and the `admin` tier as privileged.
--  * Ensure every business owner has an owner membership.
--  * Backfill `shop_settings.business_id` for legacy rows.
--  * Make sure the date_format / week_start columns and constraints exist, so
--    the saved date format can never be silently dropped by the client
--    fallback in `useUpdateShopSettings`.
--  * Re-create any missing shop_settings policies (idempotent; existing,
--    correctly-named policies are left untouched).
--
-- Safe to re-run. Run in Supabase SQL Editor after the existing migrations.

-- 1. Privileged tiers -------------------------------------------------------
-- `owner` = business creator; `admin` = app Admin tier; `manager` = delegated
-- settings access. All three may write workspace configuration.
create or replace function public.is_privileged(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.business_members
    where business_id = b
      and user_id = auth.uid()
      and role in ('owner', 'manager', 'admin')
  )
  or exists (
    select 1
    from public.businesses
    where id = b
      and owner_id = auth.uid()
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
      and me.role in ('owner', 'manager', 'admin')
      and them.user_id = target
  );
$$;

grant execute on function public.is_privileged(uuid) to authenticated;
grant execute on function public.can_manage_member(uuid) to authenticated;

-- 2. Membership + tenant data repair ---------------------------------------
do $$
declare
  v_business uuid;
  v_count integer;
begin
  -- The creator of a business is its owner, whatever an older invite/reset
  -- path may have written into business_members.
  insert into public.business_members (business_id, user_id, role)
  select b.id, b.owner_id, 'owner'
  from public.businesses b
  where exists (select 1 from auth.users u where u.id = b.owner_id)
  on conflict (business_id, user_id) do update
    set role = 'owner';

  -- Older `invite-employee` builds wrote every non-manager invitee as
  -- `staff`, so an Admin-tier member has been unable to write settings even
  -- though the app treats them as an admin. Mirror the profile tier into the
  -- membership. Never downgrade an existing owner.
  update public.business_members bm
     set role = 'owner'
    from public.user_profiles p
   where p.id = bm.user_id
     and lower(coalesce(p.role, '')) = 'owner'
     and bm.role <> 'owner';

  update public.business_members bm
     set role = 'admin'
    from public.user_profiles p
   where p.id = bm.user_id
     and lower(coalesce(p.role, '')) = 'admin'
     and bm.role in ('staff', 'manager');

  select count(*) into v_count from public.businesses;

  -- A single-workspace install: every unassigned settings row belongs to it.
  if v_count = 1 then
    select id into v_business from public.businesses order by created_at limit 1;
    if v_business is not null then
      update public.shop_settings
         set business_id = v_business
       where business_id is null;
    end if;
  else
    -- Legacy `main` row belongs to the original (oldest) workspace.
    select id into v_business from public.businesses order by created_at limit 1;
    if v_business is not null then
      update public.shop_settings
         set business_id = v_business
       where business_id is null
         and id = 'main';
    end if;

    -- Rows keyed by their business uuid.
    update public.shop_settings s
       set business_id = b.id
      from public.businesses b
     where s.business_id is null
       and s.id = b.id::text;
  end if;
end $$;

-- 3. Settings columns the save payload depends on ---------------------------
alter table public.shop_settings
  add column if not exists date_format text;

update public.shop_settings
   set date_format = 'DD/MM/YYYY'
 where date_format is null
    or date_format not in (
      'DD/MM/YYYY', 'DD MMM YYYY', 'DD MMMM YYYY',
      'D MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'
    );

alter table public.shop_settings
  alter column date_format set default 'DD/MM/YYYY';
alter table public.shop_settings
  alter column date_format set not null;
alter table public.shop_settings
  drop constraint if exists shop_settings_date_format_check;
alter table public.shop_settings
  add constraint shop_settings_date_format_check
  check (date_format in (
    'DD/MM/YYYY', 'DD MMM YYYY', 'DD MMMM YYYY',
    'D MMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'
  ));

alter table public.shop_settings
  add column if not exists week_start text;

update public.shop_settings
   set week_start = 'monday'
 where week_start is null
    or week_start not in (
      'sunday', 'monday', 'tuesday', 'wednesday',
      'thursday', 'friday', 'saturday'
    );

alter table public.shop_settings
  alter column week_start set default 'monday';
alter table public.shop_settings
  alter column week_start set not null;
alter table public.shop_settings
  drop constraint if exists shop_settings_week_start_check;
alter table public.shop_settings
  add constraint shop_settings_week_start_check
  check (week_start in (
    'sunday', 'monday', 'tuesday', 'wednesday',
    'thursday', 'friday', 'saturday'
  ));

-- 4. Policies: only created when the command has no policy at all ----------
do $$
begin
  if to_regclass('public.shop_settings') is null then
    return;
  end if;

  execute 'alter table public.shop_settings enable row level security';

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_settings' and cmd = 'SELECT'
  ) then
    execute 'create policy "shop_settings_tenant_read" '
      || 'on public.shop_settings for select to authenticated '
      || 'using (public.is_member(business_id))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_settings' and cmd = 'INSERT'
  ) then
    execute 'create policy "shop_settings_tenant_insert" '
      || 'on public.shop_settings for insert to authenticated '
      || 'with check (public.is_privileged(business_id))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_settings' and cmd = 'UPDATE'
  ) then
    execute 'create policy "shop_settings_tenant_update" '
      || 'on public.shop_settings for update to authenticated '
      || 'using (public.is_privileged(business_id)) '
      || 'with check (public.is_privileged(business_id))';
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'shop_settings' and cmd = 'DELETE'
  ) then
    execute 'create policy "shop_settings_tenant_delete" '
      || 'on public.shop_settings for delete to authenticated '
      || 'using (public.is_privileged(business_id))';
  end if;
end $$;

-- 5. Make the API see the constraint/helper changes immediately -------------
notify pgrst, 'reload schema';
