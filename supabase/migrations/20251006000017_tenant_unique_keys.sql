-- Multi-tenancy Phase 2a: per-business uniqueness.
--
-- 20251006000011 added business_id but left several legacy UNIQUE
-- constraints/indexes global, which makes two businesses collide on common
-- values (unit code, category name, document number, balancing date).
--
-- This migration replaces those global keys with (business_id, ...) keys.
-- Safe to re-run.

create or replace function public.pixo_scope_unique(
  p_table text,
  p_cols text[]
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  r record;
  v_idx text;
begin
  if to_regclass('public.' || p_table) is null then
    return;
  end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = p_table
      and column_name = 'business_id'
  ) then
    return;
  end if;

  -- Drop UNIQUE constraints that are exactly the legacy column set.
  for r in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = ('public.' || p_table)::regclass
      and contype = 'u'
  loop
    if r.def = 'UNIQUE (' || array_to_string(p_cols, ', ') || ')' then
      execute format('alter table public.%I drop constraint %I', p_table, r.conname);
    end if;
  end loop;

  -- Drop UNIQUE indexes (non-primary) that are exactly the legacy column set.
  for r in
    select i.indexrelid as idx
    from pg_index i
    join unnest(i.indkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = k.attnum
    where i.indrelid = ('public.' || p_table)::regclass
      and i.indisunique
      and not i.indisprimary
    group by i.indexrelid
    having array_agg(a.attname::text order by k.ord) = p_cols
  loop
    execute format('drop index if exists %s', r.idx::regclass);
  end loop;

  v_idx := p_table || '_biz_' || array_to_string(p_cols, '_') || '_key';
  execute format(
    'create unique index if not exists %I on public.%I (business_id, %s)',
    v_idx, p_table, array_to_string(p_cols, ', ')
  );
end;
$$;

select public.pixo_scope_unique('uoms', array['code']);
select public.pixo_scope_unique('uom_categories', array['name']);
select public.pixo_scope_unique('unit_conversions', array['from_unit', 'to_unit']);
select public.pixo_scope_unique('purchase_orders', array['number']);
select public.pixo_scope_unique('quotes', array['number']);
select public.pixo_scope_unique('items', array['sku']);
select public.pixo_scope_unique('client_invoices', array['number']);
select public.pixo_scope_unique('client_invoice_payments', array['number']);

-- Daily balancing was keyed by business date alone. Re-key it per business so
-- two workspaces can balance the same calendar day.
do $$
declare
  r record;
  v_idx text;
begin
  if to_regclass('public.daily_balancing') is null then
    return;
  end if;

  -- Drop a primary key / unique constraint on balance_date alone.
  for r in
    select conname, pg_get_constraintdef(oid) as def
    from pg_constraint
    where conrelid = 'public.daily_balancing'::regclass
      and contype in ('p', 'u')
  loop
    if r.def in ('PRIMARY KEY (balance_date)', 'UNIQUE (balance_date)') then
      execute format(
        'alter table public.daily_balancing drop constraint %I', r.conname
      );
    end if;
  end loop;

  -- Drop any standalone unique index on balance_date alone.
  for r in
    select i.indexrelid as idx
    from pg_index i
    join unnest(i.indkey) with ordinality as k(attnum, ord) on true
    join pg_attribute a
      on a.attrelid = i.indrelid and a.attnum = k.attnum
    where i.indrelid = 'public.daily_balancing'::regclass
      and i.indisunique
      and not i.indisprimary
    group by i.indexrelid
    having array_agg(a.attname::text order by k.ord) = array['balance_date']
  loop
    execute format('drop index if exists %s', r.idx::regclass);
  end loop;

  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.daily_balancing'::regclass and contype = 'p'
  ) then
    alter table public.daily_balancing
      add constraint daily_balancing_pkey primary key (business_id, balance_date);
  end if;

  v_idx := 'daily_balancing_biz_balance_date_key';
  execute format(
    'create unique index if not exists %I on public.daily_balancing (business_id, balance_date)',
    v_idx
  );
end $$;

-- Helper runs DDL, so it must not be callable by API users.
revoke all on function public.pixo_scope_unique(text, text[]) from public;
revoke all on function public.pixo_scope_unique(text, text[]) from anon, authenticated;

notify pgrst, 'reload schema';
