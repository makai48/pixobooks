-- Professional integrity pass:
--   1. commit_sale      — atomic + idempotent checkout (sale + payment + movements)
--   2. void_sale        — permission-checked reversal that posts stock atomically
--   3. movement history survives item deletion (FK SET NULL instead of CASCADE)
--
-- Run after 20261103000001 and 20261103000002. Safe to re-run.

-- 1. Atomic, idempotent sale commit -----------------------------------------
-- A retried checkout (lost HTTP response, offline replay) carries the same
-- stamped document number. The first insert wins; the retry returns the
-- existing row and never moves stock twice.
create or replace function public.commit_sale(
  p_sale jsonb,
  p_payment jsonb default null,
  p_movements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid := nullif(p_sale->>'business_id', '')::uuid;
  v_existing public.sales;
  v_row public.sales;
begin
  if auth.uid() is not null and v_business is not null
     and not public.is_member(v_business) then
    raise exception 'not a member of business %', v_business using errcode = '42501';
  end if;

  select * into v_existing
  from public.sales
  where number = p_sale->>'number'
    and (v_business is null or business_id = v_business)
  limit 1;

  if found then
    return jsonb_build_object('sale', to_jsonb(v_existing), 'duplicate', true);
  end if;

  insert into public.sales
  select * from jsonb_populate_record(null::public.sales, p_sale)
  returning * into v_row;

  if p_payment is not null and p_payment <> 'null'::jsonb then
    insert into public.sale_payments
    select * from jsonb_populate_record(
      null::public.sale_payments,
      p_payment || jsonb_build_object('sale_id', v_row.id)
    );
  end if;

  if coalesce(jsonb_array_length(p_movements), 0) > 0 then
    -- Same transaction: a movement failure rolls the sale back.
    perform public.post_stock_movements(p_movements, true);
  end if;

  return jsonb_build_object('sale', to_jsonb(v_row), 'duplicate', false);
end $$;

grant execute on function public.commit_sale(jsonb, jsonb, jsonb) to authenticated;

-- 2. Authorized void --------------------------------------------------------
-- Marks the document voided AND posts the restoring movements in one
-- transaction. Only owners/admins or holders of `sales.void` may call it;
-- the UI check is no longer the only gate.
create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text default null,
  p_movements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales;
  v_allowed boolean := false;
  v_name text;
begin
  select * into v_sale from public.sales where id = p_sale_id;
  if not found then
    raise exception 'Sale not found' using errcode = 'P0002';
  end if;
  if v_sale.voided_at is not null then
    raise exception 'This sale is already voided' using errcode = 'P0001';
  end if;

  if v_uid is not null then
    if v_sale.business_id is not null and not public.is_member(v_sale.business_id) then
      raise exception 'not a member of this business' using errcode = '42501';
    end if;
    -- Role- or permission-based, tolerant of permissions stored as text[] or jsonb.
    select exists (
      select 1 from public.user_profiles p
      where p.id = v_uid
        and (
          lower(coalesce(p.role, '')) in ('owner', 'admin')
          or coalesce(p.permissions::text, '') like '%sales.void%'
        )
    ) into v_allowed;
    if not v_allowed then
      raise exception 'sales.void permission required' using errcode = '42501';
    end if;
    select username into v_name from public.user_profiles where id = v_uid;
  end if;

  update public.sales
     set voided_at = now(),
         voided_by = v_uid,
         voided_by_name = v_name,
         void_reason = nullif(btrim(coalesce(p_reason, '')), '')
   where id = p_sale_id
  returning * into v_sale;

  if coalesce(jsonb_array_length(p_movements), 0) > 0 then
    perform public.post_stock_movements(p_movements, true);
  end if;

  return to_jsonb(v_sale);
end $$;

grant execute on function public.void_sale(uuid, text, jsonb) to authenticated;

-- 3. Keep ledger history when an item is deleted ----------------------------
-- Deleting a catalogue item must not erase its stock audit trail. The
-- movement keeps its quantity/reason and simply loses the live item link.
alter table public.stock_movements
  alter column item_id drop not null;

alter table public.stock_movements
  drop constraint if exists stock_movements_item_id_fkey;

alter table public.stock_movements
  add constraint stock_movements_item_id_fkey
  foreign key (item_id) references public.items(id) on delete set null;

notify pgrst, 'reload schema';
