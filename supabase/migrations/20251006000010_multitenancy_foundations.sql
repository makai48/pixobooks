-- Multi-tenancy foundations (Phase 1): businesses, memberships, RLS helpers
-- and the create_business RPC. Additive only: creates new objects and never
-- alters an existing table, so it is safe to run before the tenant backfill.
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  country_iso2 text null,
  timezone text null,
  currency text null,
  master_scope text not null default 'shared'
    check (master_scope in ('shared','per_branch')),
  legacy_owner_access text not null default 'none'
    check (legacy_owner_access in ('none','platform_admin','supreme','delegate')),
  legacy_owner_emails text[] not null default '{}',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Re-run safety: add the delegate-emails column if the table already exists.
alter table public.businesses
  add column if not exists legacy_owner_emails text[] not null default '{}';

create table if not exists public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff',
  branch_id uuid null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

create index if not exists businesses_owner_idx on public.businesses (owner_id);
create index if not exists business_members_user_idx on public.business_members (user_id);

-- Membership predicates. SECURITY DEFINER so policies can read memberships
-- without recursing back through RLS.
create or replace function public.current_business_ids()
returns setof uuid
language sql
stable
security definer
set search_path = public
as $$
  select business_id from public.business_members where user_id = auth.uid();
$$;

create or replace function public.is_member(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members
    where business_id = b and user_id = auth.uid()
  );
$$;

create or replace function public.is_privileged(b uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.business_members
    where business_id = b
      and user_id = auth.uid()
      and role in ('owner','manager')
  );
$$;

create or replace function public.member_branch(b uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select branch_id from public.business_members
  where business_id = b and user_id = auth.uid()
  limit 1;
$$;

grant execute on function public.current_business_ids() to authenticated;
grant execute on function public.is_member(uuid) to authenticated;
grant execute on function public.is_privileged(uuid) to authenticated;
grant execute on function public.member_branch(uuid) to authenticated;

alter table public.businesses enable row level security;
alter table public.business_members enable row level security;

drop policy if exists "businesses_member_read" on public.businesses;
create policy "businesses_member_read"
  on public.businesses for select
  to authenticated
  using (public.is_member(id));

drop policy if exists "businesses_owner_all" on public.businesses;
create policy "businesses_owner_all"
  on public.businesses for all
  to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

drop policy if exists "business_members_read" on public.business_members;
create policy "business_members_read"
  on public.business_members for select
  to authenticated
  using (public.is_member(business_id));

drop policy if exists "business_members_privileged_write" on public.business_members;
create policy "business_members_privileged_write"
  on public.business_members for all
  to authenticated
  using (public.is_privileged(business_id))
  with check (public.is_privileged(business_id));

-- Atomic create: business + owner membership in one transaction. The owner
-- cannot self-insert the membership row under RLS, so this is the only path.
drop function if exists public.create_business(text, text, text);

create or replace function public.create_business(
  p_name text,
  p_master_scope text default 'shared',
  p_legacy_owner_access text default 'none',
  p_legacy_owner_emails text[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_id uuid;
begin
  if auth.uid() is null then
    raise exception 'not authenticated';
  end if;
  if p_name is null or length(trim(p_name)) = 0 then
    raise exception 'business name is required';
  end if;

  insert into public.businesses (
    name, owner_id, master_scope, legacy_owner_access, legacy_owner_emails
  )
  values (
    trim(p_name), auth.uid(), p_master_scope, p_legacy_owner_access,
    coalesce(p_legacy_owner_emails, '{}')
  )
  returning id into v_id;

  insert into public.business_members (business_id, user_id, role)
  values (v_id, auth.uid(), 'owner');

  return v_id;
end;
$$;

grant execute on function public.create_business(text, text, text, text[]) to authenticated;
