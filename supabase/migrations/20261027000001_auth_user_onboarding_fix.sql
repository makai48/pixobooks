-- Fix: a newly created employee cannot sign in with the temporary password.
--
-- WHY THIS MIGRATION EXISTS
-- -------------------------
-- `invite-employee` and `reset-employee-password` create/reset auth users
-- through `public.admin_create_or_reset_user(...)`, which used to live only in
-- the Supabase dashboard (no versioned definition). Bypassing GoTrue by writing
-- `auth.users` directly is fragile: GoTrue reads that row on every sign-in and
-- scans it into Go structs. If ANY of the following is wrong, first sign-in
-- fails even though the temp password looks correct in the UI:
--
--   * a nullable text column is NULL        -> 500 "Database error querying schema"
--   * a nullable boolean column is NULL     -> 500 "Database error querying schema"
--   * `email_confirmed_at` is NULL          -> 400 "Email not confirmed"
--   * `encrypted_password` is missing/not   -> 400 "Invalid login credentials"
--     bcrypt (`$2a$`/`$2b$`)
--   * no `auth.identities` email row        -> account cannot be resolved
--
-- This migration takes ownership of that function so the app controls every
-- column GoTrue depends on, adds a reusable repair routine, and repairs the
-- users that already exist. The edge functions additionally verify the temp
-- password against GoTrue before returning it, so a broken row can never be
-- handed to an employee again.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- 1. pgcrypto ---------------------------------------------------------------
-- Auth password hashes are bcrypt. Supabase installs pgcrypto in `extensions`;
-- the fallback in the functions below also handles a `public` install.
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;

-- 2. Take over the dashboard-owned function ---------------------------------
-- Drop every overload shaped like the one the edge functions call
-- (text, text, jsonb [, ...]) so parameter names / return type cannot conflict.
do $$
declare
  f record;
begin
  for f in
    select p.oid
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'admin_create_or_reset_user'
      and p.pronargs >= 3
      and p.proargtypes[0] = 'text'::regtype
      and p.proargtypes[1] = 'text'::regtype
      and p.proargtypes[2] = 'jsonb'::regtype
  loop
    execute format('drop function %s', f.oid::regprocedure);
    raise notice 'dropped legacy %', f.oid::regprocedure;
  end loop;
end $$;

-- 3. Repair one auth user ---------------------------------------------------
-- Normalises every column GoTrue scans and makes sure the account is confirmed
-- and has an email identity. Idempotent; safe to call after every create/reset.
--
-- p_confirm:
--   true  -> caller is the invite / reset path; confirm the address.
--   false -> caller is the bulk repair below; only confirm accounts that
--            already carry invite/temp flags, never a self-signup.
drop function if exists public.pixo_repair_auth_user(uuid);

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
  --     whole query. An empty string is the documented safe value.
  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type in ('text', 'character varying', 'character')
      and c.is_nullable = 'YES'
      and c.is_generated = 'NEVER'
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

  -- (c) Integer columns that GoTrue scans as numbers, not pointers.
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

  -- (d) Core identity columns.
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

  -- (e) Confirmation. `confirmed_at` is a generated column on modern GoTrue, so
  --     only email_confirmed_at is written and the generated value follows.
  --
  --     Only confirm when this is an invite/reset path (p_confirm = true) or,
  --     for the bulk repair, when the profile already carries invite flags.
  --     A self-signup is never silently confirmed.
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'auth' and table_name = 'users'
      and column_name = 'email_confirmed_at'
  ) then
    v_should_confirm := coalesce(p_confirm, false);

    if not v_should_confirm and to_regclass('public.user_profiles') is not null then
      -- Build the predicate only from columns that actually exist, so this
      -- works on installs where the profile flags were never added.
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

  -- (f) Make sure an email identity exists so GoTrue can resolve the account.
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
        -- Older GoTrue schemas may not have `provider_id`. Log and continue;
        -- the user can still sign in from auth.users on those versions.
        raise notice 'pixo_repair_auth_user(%): identity insert skipped: %',
          p_user_id, sqlerrm;
    end;
  end if;

  -- Keep an existing email identity consistent with the confirmed account:
  -- `sub`, `email` and `email_verified` are what GoTrue reads back.
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

-- 4. Create-or-reset with a correct bcrypt hash -----------------------------
-- Returns the auth user id. Creates the row when the email is new, otherwise
-- rewrites the password + confirmation and merges metadata. Column lists are
-- built dynamically from the live auth schema so missing/newer columns never
-- break the insert.
create or replace function public.admin_create_or_reset_user(
  p_email text,
  p_password text,
  p_metadata jsonb default '{}'::jsonb
)
returns uuid
language plpgsql
security definer
set search_path = pg_catalog, public, auth, extensions
as $fn$
declare
  v_email text := lower(btrim(coalesce(p_email, '')));
  v_user_id uuid;
  v_row jsonb;
  v_cols text;
  v_vals text;
  v_hash text;
  v_now timestamptz := now();
  col record;
begin
  if v_email = '' then
    raise exception 'admin_create_or_reset_user: email is required';
  end if;
  if p_password is null or length(p_password) < 6 then
    raise exception 'admin_create_or_reset_user: password must be at least 6 characters';
  end if;

  -- bcrypt exactly the way GoTrue verifies it.
  begin
    v_hash := extensions.crypt(p_password, extensions.gen_salt('bf', 10));
  exception
    when undefined_function then
      v_hash := crypt(p_password, gen_salt('bf', 10));
  end;

  select u.id
    into v_user_id
    from auth.users u
   where lower(u.email) = v_email
   limit 1;

  if v_user_id is null then
    -- ---- create --------------------------------------------------------
    v_row := jsonb_build_object(
      'id', gen_random_uuid(),
      'instance_id', '00000000-0000-0000-0000-000000000000',
      'aud', 'authenticated',
      'role', 'authenticated',
      'email', v_email,
      'encrypted_password', v_hash,
      'email_confirmed_at', v_now,
      'created_at', v_now,
      'updated_at', v_now,
      'raw_app_meta_data', jsonb_build_object(
        'provider', 'email',
        'providers', jsonb_build_array('email')
      ),
      'raw_user_meta_data', coalesce(p_metadata, '{}'::jsonb)
    );

    -- Fill every nullable text/boolean/integer column so the fresh row is
    -- immediately safe for GoTrue to scan.
    for col in
      select c.column_name, c.data_type
      from information_schema.columns c
      where c.table_schema = 'auth'
        and c.table_name = 'users'
        and c.is_nullable = 'YES'
        and c.is_generated = 'NEVER'
        and c.data_type in (
          'text', 'character varying', 'character', 'boolean',
          'smallint', 'integer', 'bigint'
        )
    loop
      if not v_row ? col.column_name then
        if col.data_type = 'boolean' then
          v_row := v_row || jsonb_build_object(col.column_name, false);
        elsif col.data_type in ('smallint', 'integer', 'bigint') then
          v_row := v_row || jsonb_build_object(col.column_name, 0);
        else
          v_row := v_row || jsonb_build_object(col.column_name, '');
        end if;
      end if;
    end loop;

    -- Only reference columns that exist and are writable (never generated).
    select
      string_agg(format('%I', a.attname), ', ' order by a.attnum),
      string_agg(
        format('($1->>%L)::%s', a.attname, format_type(a.atttypid, a.atttypmod)),
        ', ' order by a.attnum
      )
      into v_cols, v_vals
      from jsonb_object_keys(v_row) as k(name)
      join pg_attribute a
        on a.attrelid = 'auth.users'::regclass
       and a.attname = k.name
       and a.attnum > 0
       and not a.attisdropped
       and a.attgenerated = '';

    if v_cols is null then
      raise exception 'admin_create_or_reset_user: could not map auth.users columns';
    end if;

    execute format(
      'insert into auth.users (%s) values (%s) returning id',
      v_cols, v_vals
    )
      into v_user_id
      using v_row;
  else
    -- ---- reset ---------------------------------------------------------
    update auth.users
       set email = v_email,
           encrypted_password = v_hash,
           email_confirmed_at = coalesce(email_confirmed_at, v_now),
           raw_app_meta_data = coalesce(raw_app_meta_data, '{}'::jsonb)
             || jsonb_build_object(
                  'provider', 'email',
                  'providers', jsonb_build_array('email')
                ),
           raw_user_meta_data = coalesce(raw_user_meta_data, '{}'::jsonb)
             || coalesce(p_metadata, '{}'::jsonb),
           updated_at = v_now
     where id = v_user_id;
  end if;

  -- This is the invite/reset path, so the account must be confirmed.
  perform public.pixo_repair_auth_user(v_user_id, true);
  return v_user_id;
end;
$fn$;

-- 5. Lock the helpers down to the service role ------------------------------
-- The edge functions call them with the service-role key; no client may.
revoke all on function public.admin_create_or_reset_user(text, text, jsonb) from public;
revoke all on function public.admin_create_or_reset_user(text, text, jsonb) from anon, authenticated;
grant execute on function public.admin_create_or_reset_user(text, text, jsonb) to service_role;

revoke all on function public.pixo_repair_auth_user(uuid, boolean) from public;
revoke all on function public.pixo_repair_auth_user(uuid, boolean) from anon, authenticated;
grant execute on function public.pixo_repair_auth_user(uuid, boolean) to service_role;

-- 6. Repair every existing auth user ----------------------------------------
-- Existing invitations may already carry NULL columns / unconfirmed emails.
-- Each row is repaired independently so one failure cannot abort the run.
do $$
declare
  u record;
  v_repaired bigint := 0;
begin
  for u in select id from auth.users loop
    begin
      perform public.pixo_repair_auth_user(u.id, false);
      v_repaired := v_repaired + 1;
    exception
      when others then
        raise notice 'auth user repair failed for %: %', u.id, sqlerrm;
    end;
  end loop;
  raise notice 'auth user repair complete: % row(s) processed', v_repaired;
end $$;
