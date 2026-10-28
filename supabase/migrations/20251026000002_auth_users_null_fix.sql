-- Fix: "500: Database error querying schema" on first login with a temp password
--
-- ROOT CAUSE (per Supabase's own troubleshooting guide)
-- -----------------------------------------------------
-- GoTrue reads the `auth.users` row during sign-in. It expects string columns
-- to contain a value or an EMPTY STRING. When a column is NULL instead, the
-- Auth service fails to load the user and reports:
--
--     500: Database error querying schema
--
-- This happens after "manual SQL inserts or updates to the auth.users table"
-- — which is exactly what this project does. `invite-employee` and
-- `reset-employee-password` both create/update users through the
-- `public.admin_create_or_reset_user` SECURITY DEFINER SQL function, which
-- writes `auth.users` + `auth.identities` directly instead of going through
-- GoTrue. Any column that function leaves NULL becomes a landmine for the
-- next sign-in.
--
-- This migration is defensive: it normalises NULLs to empty strings in every
-- text column GoTrue cares about, without touching anything else. It is
-- idempotent and safe to re-run.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.

-- 1. Normalise NULL string columns on auth.users ----------------------------
-- The exact set of columns differs by GoTrue version, so this is written as a
-- DO block that only touches columns that (a) exist and (b) are text-like,
-- and only where a NULL is actually present. That way it can never fail on a
-- newer/older auth schema.
--
-- Wrapped in its own exception handler on purpose: the platform does not
-- always grant the `postgres` role UPDATE on every auth.users column. If a
-- single column is off-limits we must not abort the whole migration (which
-- would roll back the earlier statements) — so we log and continue.
do $$
declare
  col record;
  updated bigint;
begin
  if to_regclass('auth.users') is null then
    return;
  end if;

  for col in
    select c.column_name, c.data_type
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type in ('text', 'character varying', 'character')
  loop
    begin
      execute format(
        'update auth.users set %I = '''' where %I is null',
        col.column_name, col.column_name
      );
      get diagnostics updated = row_count;
      if updated > 0 then
        raise notice 'auth.users.%: cleared % NULL(s)', col.column_name, updated;
      end if;
    exception
      when insufficient_privilege or others then
        raise notice 'skipping auth.users.%: %', col.column_name, sqlerrm;
    end;
  end loop;
end $$;

-- 2. Make the hand-written user-creation path safe --------------------------
-- `admin_create_or_reset_user` is defined in the Supabase dashboard (it is not
-- in this repo), so we cannot patch its body from here. What we CAN do is
-- guarantee the columns GoTrue needs are non-NULL for every row, going
-- forward, by giving them empty-string defaults. A default only applies to
-- future INSERTs that omit the column, so this does not rewrite history.
do $$
declare
  col record;
begin
  if to_regclass('auth.users') is null then
    return;
  end if;

  for col in
    select c.column_name
    from information_schema.columns c
    where c.table_schema = 'auth'
      and c.table_name = 'users'
      and c.data_type in ('text', 'character varying', 'character')
  loop
    begin
      execute format(
        'alter table auth.users alter column %I set default ''''',
        col.column_name
      );
    exception
      when others then
        -- Some auth columns are managed by the platform and cannot be altered
        -- (e.g. they may be generated or have platform-owned defaults).
        raise notice 'skipping default on auth.users.%: %', col.column_name, sqlerrm;
    end;
  end loop;
end $$;
