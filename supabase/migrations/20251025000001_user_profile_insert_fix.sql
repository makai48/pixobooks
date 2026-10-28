-- Fix: employee invite / account creation failing with
--   "user_profiles: new row violates row-level security policy for table
--    "user_profiles""
--
-- ROOT CAUSE
-- ----------
-- 20251006000012_tenant_rls.sql drops every policy on public.user_profiles
-- and recreates only three: one SELECT and two UPDATEs. There is NO INSERT
-- policy, so any insert that is not performed by the service role is rejected.
--
-- Two real write paths hit this:
--
--   1. `invite-employee` upserts the profile with the service-role key, so it
--      should pass — but the profile upsert is the FIRST write after the auth
--      user is created. When the account already exists (re-invite / password
--      re-issue) the row is an UPDATE and that is covered; on a brand-new
--      account it is an INSERT and fails.
--
--   2. Any user who signs themselves up (Register / first login) has no
--      profile row yet. There is no `on_auth_user_created` trigger in this
--      repo, so the row only ever appears via an invite. Until an owner
--      invites them, `user_profiles` has no row for that id — and the app's
--      own profile reads then fail too.
--
-- FIX
-- ---
--  * Allow a signed-in user to create their OWN profile row. This is safe:
--    the policy pins `id = auth.uid()` in both USING and WITH CHECK, so a
--    caller can only ever insert a row for themselves. Combined with
--    `id = auth.users.id`, one user can hold at most one profile.
--  * Add an `on_auth_user_created` trigger so a profile row exists the moment
--    an auth user is created — including the first owner, who has no inviter.
--    Without this, a brand-new workspace's owner has no profile and the app
--    reads as broken until an invite is sent.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- 1. Self-service profile creation -----------------------------------------
-- The upsert in `invite-employee` runs with the service role and bypasses RLS,
-- so it is not what breaks. What breaks is any write performed with the
-- caller's own key: Supabase's OWN `handle_new_user` trigger (created in the
-- Supabase dashboard, not in this repo) inserts the profile row with the new
-- user's privileges, and there is no INSERT policy for it to satisfy.
--
-- This policy lets a signed-in user create their OWN profile row only:
-- `id = auth.uid()` in both USING and WITH CHECK means a caller can never
-- insert a row for anyone else.
do $$
begin
  if to_regclass('public.user_profiles') is null then
    return;
  end if;

  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'user_profiles'
      and policyname = 'profiles_self_insert'
  ) then
    execute 'create policy "profiles_self_insert" '
      || 'on public.user_profiles for insert to authenticated '
      || 'with check (id = auth.uid())';
  end if;
end $$;

-- 2. Auto-create a profile row when an auth user is created -----------------
-- SECURITY DEFINER + fixed search_path: the function runs as its owner, so
-- the trigger can insert into user_profiles even though the new user has no
-- RLS rights of their own yet.
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business_id uuid;
  v_role text;
begin
  -- Pick the business to attach the new profile to.
  --   * an explicit business_id in the signup metadata wins,
  --   * otherwise the caller's own business, when there is exactly one,
  --   * otherwise the oldest business (first-workspace bootstrap).
  v_business_id := nullif(new.raw_user_meta_data ->> 'business_id', '')::uuid;

  if v_business_id is null then
    select bm.business_id into v_business_id
    from public.business_members bm
    where bm.user_id = new.id
    order by bm.created_at
    limit 1;
  end if;

  if v_business_id is null then
    select b.id into v_business_id
    from public.businesses b
    order by b.created_at
    limit 1;
  end if;

  -- Role: metadata wins, else owner when this is the very first account.
  v_role := nullif(new.raw_user_meta_data ->> 'role', '');
  if v_role is null then
    if not exists (select 1 from public.user_profiles) then
      v_role := 'Owner';
    else
      v_role := 'Staff';
    end if;
  end if;

  insert into public.user_profiles (
    id,
    email,
    username,
    role,
    permissions,
    active,
    approval_status
  )
  values (
    new.id,
    coalesce(new.email, ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'username', ''),
      nullif(new.raw_user_meta_data ->> 'display_name', ''),
      split_part(coalesce(new.email, 'user'), '@', 1)
    ),
    v_role,
    coalesce(
      nullif(new.raw_user_meta_data ->> 'permissions', '')::jsonb,
      '["pos.sell", "inventory.view"]'::jsonb
    ),
    true,
    'approved'
  )
  on conflict (id) do update
    set username = coalesce(
          nullif(new.raw_user_meta_data ->> 'username', ''),
          nullif(new.raw_user_meta_data ->> 'display_name', ''),
          public.user_profiles.username
        ),
        email = coalesce(new.email, public.user_profiles.email);

  -- Attach membership so tenant RLS grants access to that business.
  if v_business_id is not null then
    insert into public.business_members (business_id, user_id, role)
    values (v_business_id, new.id, case when v_role = 'Owner' then 'owner' else 'staff' end)
    on conflict (business_id, user_id) do update
      set role = case when v_role = 'Owner' then 'owner' else 'staff' end;
  end if;

  return new;
end;
$$;

-- Attach the trigger (idempotent).
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();
