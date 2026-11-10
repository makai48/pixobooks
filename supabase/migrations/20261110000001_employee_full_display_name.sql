-- Team profiles now keep the legal/full name separately from the convenient
-- display name used throughout the app (POS, reports, receipts).
alter table public.user_profiles
  add column if not exists full_name text;

alter table public.user_profiles
  add column if not exists display_name text;

-- Existing accounts already used `username` as their working name. Preserve it
-- as both the full-name fallback and the display-name fallback so no employee
-- loses their identity in the UI.
update public.user_profiles
set full_name = coalesce(nullif(trim(full_name), ''), nullif(trim(username), ''), email)
where full_name is null or trim(full_name) = '';

update public.user_profiles
set display_name = coalesce(nullif(trim(display_name), ''), nullif(trim(username), ''), email)
where display_name is null or trim(display_name) = '';
