-- Make employee deletion atomic: public rows + auth rows in one transaction.
--
-- WHY THIS SUPERSEDES 20261027000002
-- ----------------------------------
-- 000002 removed only the GoTrue child rows + `auth.users`. The edge function
-- deleted `user_profiles` / `business_members` separately, BEFORE the auth
-- delete. When the auth delete then failed, the profile was already gone:
-- the employee vanished from the app while their `auth.users` row (and
-- therefore their login) survived. That is the "deleted yet still in
-- Supabase" report.
--
-- 000003 puts every delete inside `public.admin_delete_user(uuid)`, so the
-- whole thing is one transaction: either the profile, the membership rows and
-- the auth user all go, or nothing changes and the caller gets an error.
--
-- It also repeats the 000002 backfill so this file works whether or not 000002
-- was ever applied. Safe to re-run.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
-- Then redeploy `delete-employee` (it calls this function).

-- 1. Backfill the non-pointer columns GoTrue scans when loading a user --------
-- (Not needed for the SQL delete, but required for sign-in/reset to work on
-- rows written before `admin_create_or_reset_user` existed.)
do $$
begin
  if to_regclass('auth.users') is null then
    return;
  end if;

  update auth.users
     set created_at = coalesce(created_at, now()),
         updated_at = coalesce(updated_at, now())
   where created_at is null
      or updated_at is null;

  update auth.users
     set raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
   where raw_app_meta_data is null;

  update auth.users
     set raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
   where raw_user_meta_data is null;

  raise notice 'auth user column backfill complete';
end $$;

-- 2. Delete an employee everywhere, atomically --------------------------------
-- Order: public rows -> auth child rows -> auth.users. Every table is guarded
-- with to_regclass so a schema change cannot break the function.
create or replace function public.admin_delete_user(p_user_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $fn$
begin
  if p_user_id is null then
    raise exception 'admin_delete_user: user id is required';
  end if;

  -- App-side rows. `business_members.user_id` also cascades from auth.users,
  -- but deleting here keeps the transaction self-contained.
  if to_regclass('public.business_members') is not null then
    delete from public.business_members where user_id = p_user_id;
  end if;

  if to_regclass('public.user_profiles') is not null then
    delete from public.user_profiles where id = p_user_id;
  end if;

  -- GoTrue child rows.
  if to_regclass('auth.mfa_challenges') is not null
     and to_regclass('auth.mfa_factors') is not null then
    delete from auth.mfa_challenges c
     using auth.mfa_factors f
     where c.factor_id = f.id
       and f.user_id = p_user_id;
  end if;

  if to_regclass('auth.mfa_factors') is not null then
    delete from auth.mfa_factors where user_id = p_user_id;
  end if;

  if to_regclass('auth.one_time_tokens') is not null then
    delete from auth.one_time_tokens where user_id = p_user_id;
  end if;

  if to_regclass('auth.sessions') is not null then
    delete from auth.sessions where user_id = p_user_id;
  end if;

  -- `refresh_tokens.user_id` is text on every GoTrue version so far.
  if to_regclass('auth.refresh_tokens') is not null then
    delete from auth.refresh_tokens where user_id = p_user_id::text;
  end if;

  if to_regclass('auth.identities') is not null then
    delete from auth.identities where user_id = p_user_id;
  end if;

  delete from auth.users where id = p_user_id;
end;
$fn$;

-- 3. Service role only -------------------------------------------------------
revoke all on function public.admin_delete_user(uuid) from public;
revoke all on function public.admin_delete_user(uuid) from anon, authenticated;
grant execute on function public.admin_delete_user(uuid) to service_role;

-- 4. Verify ------------------------------------------------------------------
-- `public_rows` and `auth_rows` must both be 0 for a fully deleted employee.
-- Nothing here modifies data.
do $$
declare
  bad_auth bigint;
  orphan_profiles bigint;
begin
  select count(*)
    into bad_auth
    from auth.users u
   where u.created_at is null
      or u.updated_at is null
      or u.raw_app_meta_data is null
      or u.raw_user_meta_data is null;

  select count(*)
    into orphan_profiles
    from public.user_profiles p
   where not exists (select 1 from auth.users u where u.id = p.id);

  if bad_auth > 0 then
    raise warning '% auth.users row(s) still have NULL scan-critical columns', bad_auth;
  else
    raise notice 'all auth.users rows look loadable';
  end if;

  raise notice '% orphaned user_profiles row(s) (profile without an auth user)', orphan_profiles;
end $$;
