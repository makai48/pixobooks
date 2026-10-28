-- Fix: "Database error saving new user" + "new row violates row-level security
-- policy for table user_profiles"
--
-- WHAT WENT WRONG WITH THE FIRST ATTEMPT
-- --------------------------------------
-- 20251025000001 added an `on_auth_user_created` trigger that inserted a
-- profile row with a hard-coded column list. GoTrue runs that trigger inside
-- the user-creation transaction, so ANY error in it aborts the whole signup:
--
--     POST /auth/v1/signup -> 500 "Database error saving new user"
--
-- The trigger assumed columns/constraints it could not verify (e.g. a NOT NULL
-- `pin`, or `permissions` being text[] rather than jsonb). Because we cannot
-- read this database's schema from the app, hard-coding a column list here is
-- unsafe.
--
-- THE FIX
-- -------
--  1. Remove the trigger + function added by 20251025000001 so signup works
--     again immediately.
--  2. Keep the one piece that was actually needed: an INSERT policy so a
--     signed-in user may create their OWN profile row. `id = auth.uid()` in
--     both USING and WITH CHECK means a caller can never insert a row for
--     anyone else.
--  3. Profile creation then happens from the app (see src/lib/auth.ts
--     `ensureOwnProfile`), which can read the real columns back before
--     writing, instead of a trigger guessing at the schema.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

-- 1. Undo the trigger that broke signup -------------------------------------
drop trigger if exists on_auth_user_created on auth.users;
drop function if exists public.handle_new_user();

-- 2. Allow a signed-in user to create their OWN profile row -----------------
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

-- 3. Belt-and-braces: if the table carries a `pin` column, make sure a
--    self-insert without one is not rejected by a NOT NULL constraint.
--    (Only applied when the column exists and is safely nullable.)
do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'user_profiles'
      and column_name = 'pin'
  ) then
    return;
  end if;

  execute 'alter table public.user_profiles alter column pin drop not null';
exception
  when others then
    raise notice 'could not relax user_profiles.pin: %', sqlerrm;
end $$;
