-- Fix: "Failed to delete user: Database error loading user"
--
-- WHERE THE ERROR COMES FROM
-- --------------------------
-- The Supabase Dashboard (and `auth.admin.deleteUser`) asks GoTrue to delete
-- the account. GoTrue first LOADS the `auth.users` row into Go structs, and a
-- single unloadable value aborts the whole delete with:
--
--     Failed to delete user: Database error loading user
--
-- The app's own delete no longer uses GoTrue — it calls
-- `public.admin_delete_user(uuid)`, which deletes by SQL. But the Dashboard
-- will keep failing until the row itself is loadable again.
--
-- WHAT MAKES A ROW UNLOADABLE
-- ---------------------------
-- 1. NULL in a column GoTrue scans as a non-pointer (text/bool/int, plus
--    created_at, updated_at, instance_id).
-- 2. `raw_app_meta_data` / `raw_user_meta_data` that are NULL **or not a JSON
--    object**. The earlier repair only replaced SQL NULL; a JSON string or
--    array (which `||` can produce when merging metadata) still fails GoTrue's
--    map decode. This migration normalises the shape too.
--
-- This file:
--   1. Replaces `pixo_repair_auth_user(uuid, boolean)` with a version that also
--      fixes JSON shape and timestamps.
--   2. Adds `public.auth_user_null_columns(uuid)` and
--      `public.auth_user_diagnostics()` so the offending row can be identified.
--   3. Repairs every existing auth user.
--   4. Re-creates `public.admin_delete_user(uuid)` (atomic: public rows + auth
--      rows in one transaction).
--   5. Reloads the PostgREST schema cache.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- 1. Repair one auth user -----------------------------------------------------
create or replace function public.pixo_repair_auth_user(
  p_user_id uuid,
  p_confirm boolean default false
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $fn$
declare
  col record;
  v_type text;
  v_identity_data jsonb;
  v_should_confirm boolean := false;
  v_flag_expr text;
begin
  if p_user_id is null then
    return;
  end if;

  if not exists (select 1 from auth.users where id = p_user_id) then
    return;
  end if;

  -- (a) Text columns. GoTrue scans these into Go strings, so NULL aborts the
  --     load. `email` and `phone` are deliberately left alone: GoTrue treats
  --     them as nullable, and writing '' into every NULL could collide with a
  --     unique index when several rows are repaired.
  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type in ('text', 'character varying', 'character')
      and c.is_nullable = 'YES'
      and c.is_generated = 'NEVER'
      and c.column_name not in ('email', 'phone', 'aud', 'role')
  loop
    execute format(
      'update auth.users set %I = '''' where id = $1 and %I is null',
      col.column_name, col.column_name
    ) using p_user_id;
  end loop;

  -- (b) Boolean columns. Scanned into Go bools; NULL is not accepted.
  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type = 'boolean'
      and c.is_nullable = 'YES'
      and c.is_generated = 'NEVER'
  loop
    execute format(
      'update auth.users set %I = false where id = $1 and %I is null',
      col.column_name, col.column_name
    ) using p_user_id;
  end loop;

  -- (c) Integer columns GoTrue scans as numbers, not pointers.
  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type in ('smallint', 'integer', 'bigint')
      and c.is_nullable = 'YES'
      and c.is_generated = 'NEVER'
  loop
    execute format(
      'update auth.users set %I = 0 where id = $1 and %I is null',
      col.column_name, col.column_name
    ) using p_user_id;
  end loop;

  -- (d) JSON columns. Must be an OBJECT, not just non-NULL: GoTrue decodes
  --     these into map[string]interface{}, so a JSON string or array fails
  --     with the same "Database error loading user".
  for col in
    select c.column_name, c.data_type
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type in ('jsonb', 'json')
      and c.is_generated = 'NEVER'
  loop
    execute format(
      'update auth.users set %I = ''{}''::%s
        where id = $1
          and (%I is null or jsonb_typeof(%I::jsonb) is distinct from ''object'')',
      col.column_name, col.data_type, col.column_name, col.column_name
    ) using p_user_id;
  end loop;

  -- (e) Timestamps GoTrue scans as time.Time (non-pointer).
  update auth.users
     set created_at = coalesce(created_at, now()),
         updated_at = coalesce(updated_at, now())
   where id = p_user_id
     and (created_at is null or updated_at is null);

  -- (f) Core identity columns.
  update auth.users
     set instance_id = coalesce(
           instance_id, '00000000-0000-0000-0000-000000000000'::uuid
         ),
         aud = coalesce(nullif(aud, ''), 'authenticated'),
         role = coalesce(nullif(role, ''), 'authenticated')
   where id = p_user_id
     and (
       instance_id is null
       or aud is null or aud = ''
       or role is null or role = ''
     );

  -- (g) Confirmation. `confirmed_at` is generated on modern GoTrue, so only
  --     email_confirmed_at is written. Only confirm for invite/reset paths, or
  --     (bulk repair) for profiles that already carry invite flags.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) then
    v_should_confirm := coalesce(p_confirm, false);

    if not v_should_confirm and to_regclass('public.user_profiles') is not null then
      select nullif(concat_ws(
               ' or ',
               case when exists (
                 select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'must_change_password'
               ) then 'coalesce(p.must_change_password, false)' end,
               case when exists (
                 select 1 from information_schema.columns
                 where table_schema = 'public' and table_name = 'user_profiles'
                   and column_name = 'invited_by'
               ) then 'p.invited_by is not null' end
             ), '')
        into v_flag_expr;

      if v_flag_expr is not null then
        execute format(
          'select exists (select 1 from public.user_profiles p where p.id = $1 and (%s))',
          v_flag_expr
        )
          into v_should_confirm
          using p_user_id;
      end if;
    end if;

    if v_should_confirm then
      update auth.users
         set email_confirmed_at = coalesce(email_confirmed_at, now())
       where id = p_user_id
         and email_confirmed_at is null;
    end if;
  end if;

  -- (h) Make sure an email identity exists so GoTrue can resolve the account.
  if to_regclass('auth.identities') is not null
     and not exists (
       select 1
       from auth.identities i
       where i.user_id = p_user_id
         and i.provider = 'email'
     )
  then
    select jsonb_build_object(
             'sub', u.id::text,
             'email', u.email,
             'email_verified', true,
             'phone_verified', false
           )
      into v_identity_data
      from auth.users u
     where u.id = p_user_id;

    select c.data_type
      into v_type
      from information_schema.columns c
     where c.table_schema = 'auth'
       and c.table_name = 'identities'
       and c.column_name = 'id';

    begin
      if v_type = 'uuid' then
        insert into auth.identities
          (id, user_id, provider_id, identity_data, provider,
           last_sign_in_at, created_at, updated_at)
        values
          (gen_random_uuid(), p_user_id, p_user_id::text, v_identity_data,
           'email', now(), now(), now());
      else
        insert into auth.identities
          (id, user_id, provider_id, identity_data, provider,
           last_sign_in_at, created_at, updated_at)
        values
          (p_user_id::text, p_user_id, p_user_id::text, v_identity_data,
           'email', now(), now(), now());
      end if;
    exception
      when others then
        raise notice 'pixo_repair_auth_user(%): identity insert skipped: %',
          p_user_id, sqlerrm;
    end;
  end if;

  -- Keep an existing email identity consistent with the confirmed account.
  if to_regclass('auth.identities') is not null then
    begin
      update auth.identities i
         set identity_data = coalesce(i.identity_data, '{}'::jsonb)
           || jsonb_build_object(
                'sub', u.id::text,
                'email', u.email,
                'email_verified', true
              )
        from auth.users u
       where i.user_id = p_user_id
         and i.provider = 'email'
         and u.id = p_user_id;
    exception
      when others then
        raise notice 'pixo_repair_auth_user(%): identity update skipped: %',
          p_user_id, sqlerrm;
    end;
  end if;
end;
$fn$;

revoke all on function public.pixo_repair_auth_user(uuid, boolean) from public;
revoke all on function public.pixo_repair_auth_user(uuid, boolean) from anon, authenticated;
grant execute on function public.pixo_repair_auth_user(uuid, boolean) to service_role;

-- 2. Diagnostics --------------------------------------------------------------
-- Lists the NULL columns on one user. `to_jsonb(row)` turns SQL NULL into JSON
-- null, so `->>` returning SQL NULL means the column is NULL.
create or replace function public.auth_user_null_columns(p_user_id uuid)
returns text[]
language sql
stable
security definer
set search_path = pg_catalog, auth
as $fn$
  select coalesce(
           array_agg(c.column_name::text order by c.column_name),
           '{}'::text[]
         )
  from information_schema.columns c
  where c.table_schema = 'auth'
    and c.table_name = 'users'
    and c.is_nullable = 'YES'
    and c.is_generated = 'NEVER'
    and exists (
      select 1
      from auth.users u
      where u.id = p_user_id
        and (to_jsonb(u) ->> c.column_name) is null
    );
$fn$;

create or replace function public.auth_user_diagnostics()
returns table (
  id uuid,
  email text,
  null_columns text[],
  app_meta_type text,
  user_meta_type text,
  loadable boolean
)
language sql
stable
security definer
set search_path = pg_catalog, auth
as $fn$
  select
    u.id,
    u.email::text,
    public.auth_user_null_columns(u.id),
    coalesce(jsonb_typeof(u.raw_app_meta_data::jsonb), 'null'),
    coalesce(jsonb_typeof(u.raw_user_meta_data::jsonb), 'null'),
    (
      public.auth_user_null_columns(u.id) = '{}'::text[]
      and jsonb_typeof(u.raw_app_meta_data::jsonb) = 'object'
      and jsonb_typeof(u.raw_user_meta_data::jsonb) = 'object'
    )
  from auth.users u
  order by u.created_at nulls first, u.email;
$fn$;

revoke all on function public.auth_user_null_columns(uuid) from public;
revoke all on function public.auth_user_null_columns(uuid) from anon, authenticated;
revoke all on function public.auth_user_diagnostics() from public;
revoke all on function public.auth_user_diagnostics() from anon, authenticated;
grant execute on function public.auth_user_null_columns(uuid) to service_role;
grant execute on function public.auth_user_diagnostics() to service_role;

-- 3. Repair every existing auth user -----------------------------------------
do $$
declare
  u record;
  v_ok bigint := 0;
  v_failed bigint := 0;
begin
  for u in select id from auth.users loop
    begin
      perform public.pixo_repair_auth_user(u.id, false);
      v_ok := v_ok + 1;
    exception
      when others then
        v_failed := v_failed + 1;
        raise notice 'auth user repair failed for %: %', u.id, sqlerrm;
    end;
  end loop;
  raise notice 'auth user repair complete: % fixed, % failed', v_ok, v_failed;
end $$;

-- 4. Atomic delete (supersedes 20261027000003) --------------------------------
-- Public rows + auth child rows + auth user, in one transaction.
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

  if to_regclass('public.business_members') is not null then
    delete from public.business_members where user_id = p_user_id;
  end if;

  if to_regclass('public.user_profiles') is not null then
    delete from public.user_profiles where id = p_user_id;
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

  if to_regclass('auth.refresh_tokens') is not null then
    delete from auth.refresh_tokens where user_id = p_user_id::text;
  end if;

  if to_regclass('auth.identities') is not null then
    delete from auth.identities where user_id = p_user_id;
  end if;

  delete from auth.users where id = p_user_id;
end;
$fn$;

revoke all on function public.admin_delete_user(uuid) from public;
revoke all on function public.admin_delete_user(uuid) from anon, authenticated;
grant execute on function public.admin_delete_user(uuid) to service_role;

-- 5. Make PostgREST see the new/updated functions immediately -----------------
notify pgrst, 'reload schema';

-- 6. Final report -------------------------------------------------------------
do $$
declare
  v_total bigint;
  v_bad bigint;
  v_bad_json bigint;
begin
  select count(*) into v_total from auth.users;
  select count(*) into v_bad
    from auth.users u
   where public.auth_user_null_columns(u.id) <> '{}'::text[];
  select count(*) into v_bad_json
    from auth.users u
   where jsonb_typeof(u.raw_app_meta_data::jsonb) is distinct from 'object'
      or jsonb_typeof(u.raw_user_meta_data::jsonb) is distinct from 'object';

  raise notice 'auth.users: % total, % with NULL scan columns, % with non-object metadata',
    v_total, v_bad, v_bad_json;

  if v_bad = 0 and v_bad_json = 0 then
    raise notice 'all auth users should now be loadable by GoTrue';
  else
    raise warning 'some rows still need attention: select * from public.auth_user_diagnostics() where not loadable';
  end if;
end $$;
