-- Team profile saves send an optional PIN. Older deployments still have
-- user_profiles.pin as NOT NULL, so an empty PIN produced:
--   null value in column "pin" violates not-null constraint (23502)
-- Keep the column nullable and backfill blank values for accounts that never
-- configured a quick-switch PIN.
update public.user_profiles
set pin = ''
where pin is null;

alter table public.user_profiles
  alter column pin drop not null;

alter table public.user_profiles
  alter column pin set default '';
