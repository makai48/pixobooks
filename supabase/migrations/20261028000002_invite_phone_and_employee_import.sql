-- Fix: three import / invite failures
--
-- 1. INVITE  [500] SQL create/reset failed: duplicate key value violates
--    unique constraint "users_phone_key" | Key (phone)=() already exists
--
--    `admin_create_or_reset_user` filled EVERY nullable text column with ''.
--    `auth.users.phone` is nullable but UNIQUE, so the first row that got ''
--    blocked every later invite. The column default is NULL, and NULL is what
--    a unique index allows repeatedly, so phone is now left out of the fill
--    (and existing '' values are normalised to NULL).
--
-- 2. EMPLOYEES IMPORT  user_profiles: new row violates row-level security
--    policy for table "user_profiles"
--
--    The import wrote profiles with the caller's key. RLS on user_profiles
--    only allows INSERT for `id = auth.uid()`, so importing teammates was
--    rejected. `public.import_employee_profiles(jsonb)` upserts profiles as
--    the function owner, but only after checking that the caller is an owner,
--    a manager of that member, or the member themselves. Rows whose auth
--    account does not exist are skipped with an explanation — a profile
--    without a login is not a user; use Invite for those.
--
-- 3. SALES IMPORT  Could not find the 'payments' column of 'sales'
--
--    Fixed in `src/lib/import.ts` (the export nests payments inside each sale;
--    the importer now writes them to `sale_payments`). No SQL change needed.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- 1. Existing empty phones would keep colliding -------------------------------
update auth.users
   set phone = null
 where phone = '';

-- 2. Create/reset user, without the empty-phone collision ---------------------
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
    --
    -- `phone` is deliberately excluded: it is UNIQUE and its schema default is
    -- NULL, which is the only value a unique index accepts more than once.
    -- Writing '' there makes the SECOND invite fail with users_phone_key.
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
        if col.column_name = 'phone' then
          -- Leave it absent so the column default (NULL) applies.
          null;
        elsif col.data_type = 'boolean' then
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

  -- A row created by an older version of this function may still hold ''.
  update auth.users
     set phone = null
   where id = v_user_id
     and phone = '';

  -- This is the invite/reset path, so the account must be confirmed.
  perform public.pixo_repair_auth_user(v_user_id, true);
  return v_user_id;
end;
$fn$;

revoke all on function public.admin_create_or_reset_user(text, text, jsonb) from public;
revoke all on function public.admin_create_or_reset_user(text, text, jsonb) from anon, authenticated;
grant execute on function public.admin_create_or_reset_user(text, text, jsonb) to service_role;

-- 3. Employee profile import --------------------------------------------------
-- SECURITY DEFINER because RLS only permits `profiles_self_insert`
-- (id = auth.uid()). Permission is re-checked per row below, so a manager can
-- import their own team but never an unrelated account.
create or replace function public.import_employee_profiles(p_rows jsonb)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, auth
as $fn$
declare
  v_row jsonb;
  v_rec jsonb;
  v_id uuid;
  v_cols text;
  v_sel text;
  v_upd_cols text;
  v_upd_sel text;
  v_imported int := 0;
  v_skipped int := 0;
  v_errors jsonb := '[]'::jsonb;
  v_caller uuid := auth.uid();
  v_is_owner boolean := false;
  -- The only profile columns an export is allowed to write. Everything else
  -- (nested `attendance`, joined fields, columns from a newer app version) is
  -- ignored instead of failing the row.
  v_importable text[] := array[
    'id', 'email', 'username', 'role', 'pin', 'permissions', 'active',
    'avatar_url', 'phone', 'address', 'hire_date', 'emergency_contact',
    'emergency_contact_phone', 'notes', 'salary', 'failed_login_count',
    'locked_until', 'approval_status', 'approval_requested_at',
    'approved_at', 'approved_by', 'approved_by_name',
    'must_change_password', 'temp_password_expires_at', 'invited_by',
    'invited_by_name', 'invited_at'
  ];
begin
  if to_regclass('public.user_profiles') is null then
    raise exception 'import_employee_profiles: public.user_profiles is missing';
  end if;
  if v_caller is null then
    raise exception 'import_employee_profiles: authentication required';
  end if;

  select exists (
    select 1
      from public.user_profiles p
     where p.id = v_caller
       and lower(coalesce(p.role::text, '')) = 'owner'
  ) into v_is_owner;

  for v_row in
    select value from jsonb_array_elements(coalesce(p_rows, '[]'::jsonb))
  loop
    v_id := null;
    begin
      v_id := nullif(v_row ->> 'id', '')::uuid;
    exception
      when others then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'id', v_row ->> 'id',
          'error', 'Invalid id'
        );
        continue;
    end;

    if v_id is null then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'id', null,
        'error', 'Row has no id'
      );
      continue;
    end if;

    -- A profile without an auth account can never sign in. Creating one would
    -- also violate user_profiles.id -> auth.users.id.
    if not exists (select 1 from auth.users u where u.id = v_id) then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'id', v_id,
        'error', 'No account with this id — use Invite to create the employee'
      );
      continue;
    end if;

    if not (
      v_is_owner
      or v_id = v_caller
      or public.can_manage_member(v_id)
    ) then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'id', v_id,
        'error', 'Not allowed to edit this profile'
      );
      continue;
    end if;

    v_rec := (v_row - 'id') || jsonb_build_object('id', v_id::text);

    -- Only columns that exist on this deployment AND appear in the row. This
    -- keeps the function compatible with older/newer user_profiles schemas
    -- instead of failing to compile on an unknown column.
    --
    -- The values are applied through jsonb_populate_record(), which casts each
    -- JSON value with the column's own input function. That matters here:
    -- `permissions` is a text[] in this database, and casting `->>` output
    -- (`["pos.sell",...]`) by hand is fragile. jsonb_populate_record handles
    -- arrays, jsonb, enums and timestamps natively.
    select
      string_agg(format('%I', a.attname), ', ' order by a.attnum),
      string_agg(format('r.%I', a.attname), ', ' order by a.attnum),
      string_agg(format('%I', a.attname), ', ' order by a.attnum)
        filter (where a.attname <> 'id'),
      string_agg(format('r.%I', a.attname), ', ' order by a.attnum)
        filter (where a.attname <> 'id')
      into v_cols, v_sel, v_upd_cols, v_upd_sel
      from pg_attribute a
     where a.attrelid = 'public.user_profiles'::regclass
       and a.attnum > 0
       and not a.attisdropped
       and a.attgenerated = ''
       and jsonb_exists(v_rec, a.attname)
       and a.attname = any (v_importable);

    if v_cols is null then
      v_skipped := v_skipped + 1;
      v_errors := v_errors || jsonb_build_object(
        'id', v_id,
        'error', 'No importable columns'
      );
      continue;
    end if;

    begin
      if exists (select 1 from public.user_profiles p where p.id = v_id) then
        if v_upd_cols is not null then
          execute format(
            'update public.user_profiles p set (%s) = '
            || '(select %s from jsonb_populate_record(null::public.user_profiles, $1) r) '
            || 'where p.id = $2',
            v_upd_cols, v_upd_sel
          ) using v_rec, v_id;
        end if;
      else
        execute format(
          'insert into public.user_profiles (%s) '
          || 'select %s from jsonb_populate_record(null::public.user_profiles, $1) r',
          v_cols, v_sel
        ) using v_rec;
      end if;

      v_imported := v_imported + 1;
    exception
      when others then
        v_skipped := v_skipped + 1;
        v_errors := v_errors || jsonb_build_object(
          'id', v_id,
          'error', sqlerrm
        );
    end;
  end loop;

  return jsonb_build_object(
    'imported', v_imported,
    'skipped', v_skipped,
    'errors', v_errors
  );
end;
$fn$;

revoke all on function public.import_employee_profiles(jsonb) from public;
revoke all on function public.import_employee_profiles(jsonb) from anon;
grant execute on function public.import_employee_profiles(jsonb) to authenticated;
grant execute on function public.import_employee_profiles(jsonb) to service_role;

-- 4. Make PostgREST see the new/updated functions immediately -----------------
notify pgrst, 'reload schema';
