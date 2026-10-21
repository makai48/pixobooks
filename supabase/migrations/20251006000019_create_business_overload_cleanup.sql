-- Installs the single create_business RPC signature used by the client.
-- Drops every overload by OID, so older text or varchar variants cannot remain
-- alongside the 4-argument function.

create table if not exists public.businesses (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  owner_id uuid not null references auth.users (id) on delete restrict,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.businesses
  add column if not exists master_scope text not null default 'shared',
  add column if not exists legacy_owner_access text not null default 'none',
  add column if not exists legacy_owner_emails text[] not null default '{}';

create table if not exists public.business_members (
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  role text not null default 'staff',
  branch_id uuid null,
  created_at timestamptz not null default now(),
  primary key (business_id, user_id)
);

do $$
declare
  v_function regprocedure;
begin
  for v_function in
    select p.oid::regprocedure
    from pg_proc p
    join pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
      and p.proname = 'create_business'
  loop
    execute format('drop function %s', v_function);
  end loop;
end;
$$;

create function public.create_business(
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

revoke all on function public.create_business(text, text, text, text[]) from public;
revoke all on function public.create_business(text, text, text, text[]) from anon;
grant execute on function public.create_business(text, text, text, text[]) to authenticated;

notify pgrst, 'reload schema';

select p.oid::regprocedure::text as resolved_signature,
       pg_get_function_arguments(p.oid) as arguments,
       pg_get_function_result(p.oid) as result,
       p.prosecdef as security_definer,
       has_function_privilege('authenticated', p.oid, 'execute') as authenticated_can_execute,
       has_function_privilege('anon', p.oid, 'execute') as anon_can_execute
from pg_proc p
join pg_namespace n on n.oid = p.pronamespace
where n.nspname = 'public'
  and p.proname = 'create_business';
