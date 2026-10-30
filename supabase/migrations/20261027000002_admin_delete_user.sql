-- Fix: "Failed to delete user: Database error loading user"
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- `delete-employee` called GoTrue's admin API (`auth.admin.deleteUser`). Before
-- deleting, GoTrue LOADS the `auth.users` row into Go structs. Some of those
-- fields are non-pointer types, so a NULL in any of them aborts the load and
-- GoTrue answers:
--
--     Database error loading user
--
-- `pixo_repair_auth_user` normalises the text/boolean/integer columns, but it
-- never touched the columns below, and rows written before that fix can still
-- carry NULLs there:
--
--   * created_at / updated_at            -> scanned as time.Time
--   * raw_app_meta_data / raw_user_meta_data -> scanned as a non-pointer map
--
-- This migration:
--   1. Backfills those columns on every existing row (new rows are already
--      complete because `admin_create_or_reset_user` writes all four).
--   2. Adds `public.admin_delete_user(uuid)`, a service-role-only delete that
--      removes the auth child rows and then the user itself — no GoTrue load,
--      so an unloadable row can always be deleted.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- 1. Backfill the non-pointer columns GoTrue scans on load --------------------
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

-- 2. Delete an auth user without going through GoTrue ------------------------
-- Child rows go first so no foreign key can block the final delete. Every table
-- is guarded with to_regclass so a GoTrue schema change cannot break this.
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

-- 4. Report any row that still looks unloadable -----------------------------
-- Nothing here modifies data; it is a checklist so a stubborn row can be found
-- before the next delete attempt.
do $$
declare
  bad bigint;
begin
  select count(*)
    into bad
    from auth.users u
   where u.created_at is null
      or u.updated_at is null
      or u.raw_app_meta_data is null
      or u.raw_user_meta_data is null;

  if bad > 0 then
    raise warning '% auth.users row(s) still have NULL scan-critical columns', bad;
  else
    raise notice 'all auth.users rows look loadable';
  end if;
end $$;
