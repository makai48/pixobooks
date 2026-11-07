-- Phase 2: immutable stock movement ledger.
--
-- Until now `items.stock` was a number that several code paths overwrote in
-- place (sale, PO receipt, adjustment, stock take), and only adjustments left
-- a record. This migration introduces the missing ledger: every quantity that
-- enters or leaves inventory is appended here, and `items.stock` becomes a
-- cache maintained in the same transaction by `post_stock_movements`.
--
-- Design rules
--   * append-only: no UPDATE/DELETE policy is granted to clients
--   * signed qty_base: negative = issue (sale, return to supplier),
--     positive = receipt (PO, void, correction)
--   * idempotent: (source_type, source_id, item_id, source_line) is unique,
--     so a retried checkout or replayed offline queue cannot double-post, and
--     a single document line can still move several items (BOM explode)
--   * negative on-hand is allowed and recorded truthfully; the cache may go
--     below zero when a sale oversells, which is the accounting fact
--
-- Run in Supabase Dashboard -> SQL Editor -> Run. Safe to re-run.

create table if not exists public.stock_movements (
  id uuid primary key default gen_random_uuid(),
  business_id uuid,
  branch_id uuid,
  item_id uuid not null references public.items(id) on delete cascade,
  qty_base numeric not null,
  unit_cost numeric,
  source_type text not null check (
    source_type in (
      'sale', 'sale_void', 'po_receipt', 'po_return',
      'adjustment', 'stocktake', 'opening'
    )
  ),
  source_id text,
  source_line integer not null default 0,
  occurred_at timestamptz not null default now(),
  actor_id text,
  actor_name text,
  reason text,
  reversal_of uuid references public.stock_movements(id),
  created_at timestamptz not null default now()
);

create index if not exists stock_movements_item_time_idx
  on public.stock_movements (item_id, occurred_at desc);

create index if not exists stock_movements_business_time_idx
  on public.stock_movements (business_id, occurred_at desc);

alter table public.stock_movements enable row level security;

-- Repair path for an earlier run / older copy of this migration: the ledger
-- key must be unique PER ITEM (one document line can move several items when
-- a BOM explodes, and every opening row shares source_id 'baseline').
update public.stock_movements
  set source_line = 0
  where source_line is null;
alter table public.stock_movements
  alter column source_line set default 0,
  alter column source_line set not null;

-- Drop the key whether it exists as an index or as a table constraint, and
-- under either definition, before rebuilding it correctly.
do $$
declare r record;
begin
  for r in
    select c.conname
    from pg_constraint c
    join pg_class t on t.oid = c.conrelid
    where t.relname = 'stock_movements'
      and c.conname = 'stock_movements_idem_idx'
  loop
    execute format('alter table public.stock_movements drop constraint %I', r.conname);
  end loop;
end $$;
drop index if exists public.stock_movements_idem_idx;

-- A partially seeded table can hold duplicate opening rows from an earlier
-- attempt; collapse them (keeping the earliest) so the unique index builds.
delete from public.stock_movements a
using public.stock_movements b
where a.source_type = 'opening'
  and b.source_type = 'opening'
  and a.item_id = b.item_id
  and a.id > b.id;

create unique index stock_movements_idem_idx
  on public.stock_movements (source_type, source_id, item_id, source_line);

do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'stock_movements'
      and policyname = 'stock_movements_member_read'
  ) then
    execute 'create policy "stock_movements_member_read" '
      || 'on public.stock_movements for select to authenticated '
      || 'using (business_id is null or public.is_member(business_id))';
  end if;
end $$;

-- Atomic writer: append the movement(s) and move the cached balance in one
-- transaction. `p_apply = false` records the movement without touching the
-- balance (used by bulk imports that already wrote absolute stock).
create or replace function public.post_stock_movements(p_movements jsonb, p_apply boolean default true)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  m jsonb;
  v_id uuid;
  v_item uuid;
  v_qty numeric;
  v_stock numeric;
  v_business uuid;
  v_results jsonb := '[]'::jsonb;
begin
  for m in select value from jsonb_array_elements(coalesce(p_movements, '[]'::jsonb))
  loop
    v_item := nullif(m->>'item_id', '')::uuid;
    v_qty := coalesce(nullif(m->>'qty_base', '')::numeric, 0);
    v_business := nullif(m->>'business_id', '')::uuid;
    if v_item is null or v_qty = 0 then
      continue;
    end if;

    -- Authorization: a signed-in caller may only move stock in a business
    -- they belong to. Derive the business from the item when the caller did
    -- not supply one, so the check cannot be skipped by omitting it.
    if v_business is null then
      select i.business_id into v_business from public.items i where i.id = v_item;
    end if;
    if auth.uid() is not null and v_business is not null
       and not public.is_member(v_business) then
      raise exception 'not a member of business %', v_business
        using errcode = '42501';
    end if;

    -- Reset per iteration: with ON CONFLICT DO NOTHING, `returning` leaves
    -- the variable untouched, so a stale id from the previous row would be
    -- mistaken for a successful insert and the balance moved twice.
    v_id := null;

    insert into public.stock_movements (
      business_id, branch_id, item_id, qty_base, unit_cost,
      source_type, source_id, source_line, occurred_at,
      actor_id, actor_name, reason, reversal_of
    ) values (
      v_business,
      nullif(m->>'branch_id', '')::uuid,
      v_item,
      v_qty,
      nullif(m->>'unit_cost', '')::numeric,
      coalesce(nullif(m->>'source_type', ''), 'adjustment'),
      nullif(m->>'source_id', ''),
      coalesce(nullif(m->>'source_line', '')::integer, 0),
      coalesce(nullif(m->>'occurred_at', '')::timestamptz, now()),
      nullif(m->>'actor_id', ''),
      nullif(m->>'actor_name', ''),
      nullif(m->>'reason', ''),
      nullif(m->>'reversal_of', '')::uuid
    )
    on conflict (source_type, source_id, item_id, source_line) do nothing
    returning id into v_id;

    if v_id is null then
      select stock into v_stock from public.items where id = v_item;
      v_results := v_results || jsonb_build_object(
        'item_id', v_item, 'duplicate', true, 'new_stock', v_stock
      );
      continue;
    end if;

    if p_apply then
      update public.items
        set stock = coalesce(stock, 0) + v_qty,
            updated_at = now()
        where id = v_item
        returning stock into v_stock;
    else
      select stock into v_stock from public.items where id = v_item;
    end if;

    v_results := v_results || jsonb_build_object(
      'item_id', v_item, 'movement_id', v_id, 'new_stock', v_stock
    );
  end loop;

  return jsonb_build_object('movements', v_results);
end $$;

drop function if exists public.post_stock_movements(jsonb);
grant execute on function public.post_stock_movements(jsonb, boolean) to authenticated;

-- Seed an opening movement per item so the ledger starts from the balance the
-- shop actually holds today. Idempotent: runs once per item.
insert into public.stock_movements (
  business_id, item_id, qty_base, source_type, source_id, occurred_at, reason
)
select
  i.business_id, i.id, coalesce(i.stock, 0), 'opening', 'baseline',
  coalesce(i.created_at, now()), 'Opening balance at ledger activation'
from public.items i
where coalesce(i.stock, 0) <> 0
  and not exists (
    select 1 from public.stock_movements m
    where m.item_id = i.id
      and m.source_type = 'opening'
      and m.source_id = 'baseline'
  );

notify pgrst, 'reload schema';
