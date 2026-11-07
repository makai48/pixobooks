-- Transactional inventory/accounting controls.
-- Run after 20261103000004.

create table if not exists public.stock_ledger_config (
  business_id uuid primary key,
  activated_at timestamptz not null default now()
);
alter table public.stock_ledger_config enable row level security;
drop policy if exists stock_ledger_config_member_read on public.stock_ledger_config;
create policy stock_ledger_config_member_read on public.stock_ledger_config
  for select to authenticated using (public.is_member(business_id));
insert into public.stock_ledger_config (business_id)
select distinct business_id from public.items where business_id is not null
on conflict (business_id) do nothing;

-- Every movement must belong to the same business as its item. This closes the
-- remaining security-definer loophole in post_stock_movements.
create or replace function public.guard_stock_movement_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_item_business uuid;
begin
  select business_id into v_item_business from public.items where id = new.item_id;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  if v_item_business is distinct from new.business_id then
    raise exception 'Stock movement business does not match item' using errcode = '42501';
  end if;
  if new.source_type = 'po_receipt' then
    if not exists (select 1 from public.purchase_orders p
                   where p.id::text = split_part(coalesce(new.source_id, ''), ':', 1)
                     and p.business_id is not distinct from new.business_id) then
      raise exception 'Purchase receipt movement does not match its purchase order'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists stock_movement_tenant_guard on public.stock_movements;
create trigger stock_movement_tenant_guard
before insert on public.stock_movements
for each row execute function public.guard_stock_movement_tenant();

-- An item with movement history is an accounting master record, not disposable
-- catalogue data. Deactivate/archive it instead of orphaning future reversals.
create or replace function public.prevent_inventory_item_delete()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.stock_movements where item_id = old.id) then
    raise exception 'Items with stock history cannot be deleted; deactivate the item instead'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists inventory_item_delete_guard on public.items;
create trigger inventory_item_delete_guard
before delete on public.items
for each row execute function public.prevent_inventory_item_delete();

create or replace function public.guard_item_stock_write()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.stock is distinct from old.stock
     and coalesce(current_setting('app.stock_ledger_rpc', true), '') <> 'on' then
    raise exception 'items.stock is ledger-controlled; post a stock movement'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists item_stock_write_guard on public.items;
create trigger item_stock_write_guard
before update on public.items
for each row execute function public.guard_item_stock_write();

-- Re-declare the existing movement writer with a transaction-local permission
-- flag. Direct API updates to items.stock remain impossible, while the writer
-- can update the cache in the same transaction as the movement.
create or replace function public.post_stock_movements(p_movements jsonb, p_apply boolean default true)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare m jsonb; v_id uuid; v_item uuid; v_qty numeric; v_stock numeric;
  v_business uuid; v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null and coalesce(current_setting('app.stock_internal', true), '') <> 'on'
     and coalesce(current_setting('app.commit_sale_rpc', true), '') <> 'on'
     and coalesce(current_setting('app.sale_void_rpc', true), '') <> 'on'
     and coalesce(current_setting('app.receive_po_rpc', true), '') <> 'on' then
    raise exception 'Use an authorized inventory transaction RPC' using errcode = '42501';
  end if;
  perform set_config('app.stock_ledger_rpc', 'on', true);
  for m in select value from jsonb_array_elements(coalesce(p_movements, '[]'::jsonb)) loop
    v_item := nullif(m->>'item_id', '')::uuid;
    v_qty := coalesce(nullif(m->>'qty_base', '')::numeric, 0);
    v_business := nullif(m->>'business_id', '')::uuid;
    if v_item is null or v_qty = 0 then continue; end if;
    if v_business is null then select i.business_id into v_business from public.items i where i.id = v_item; end if;
    if auth.uid() is not null and v_business is not null and not public.is_member(v_business) then
      raise exception 'not a member of business %', v_business using errcode = '42501';
    end if;
    v_id := null;
    insert into public.stock_movements
      (business_id, branch_id, item_id, qty_base, unit_cost, source_type, source_id,
       source_line, occurred_at, actor_id, actor_name, reason, reversal_of)
    values (v_business, nullif(m->>'branch_id','')::uuid, v_item, v_qty,
      nullif(m->>'unit_cost','')::numeric,
      coalesce(nullif(m->>'source_type',''),'adjustment'), nullif(m->>'source_id',''),
      coalesce(nullif(m->>'source_line','')::integer,0),
      coalesce(nullif(m->>'occurred_at','')::timestamptz,now()),
      nullif(m->>'actor_id',''), nullif(m->>'actor_name',''), nullif(m->>'reason',''),
      nullif(m->>'reversal_of','')::uuid)
    on conflict (source_type, source_id, item_id, source_line) do nothing
    returning id into v_id;
    if v_id is null then
      select stock into v_stock from public.items where id = v_item;
      v_results := v_results || jsonb_build_object('item_id',v_item,'duplicate',true,'new_stock',v_stock);
      continue;
    end if;
    if p_apply then
      update public.items set stock = coalesce(stock,0) + v_qty, updated_at = now()
        where id = v_item returning stock into v_stock;
    else
      select stock into v_stock from public.items where id = v_item;
    end if;
    v_results := v_results || jsonb_build_object('item_id',v_item,'movement_id',v_id,'new_stock',v_stock);
  end loop;
  return jsonb_build_object('movements',v_results);
end;
$$;
grant execute on function public.post_stock_movements(jsonb, boolean) to authenticated;

create or replace function public.guard_received_purchase_order()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if (old.status = 'received' or exists (
    select 1 from jsonb_array_elements(coalesce(old.lines, '[]'::jsonb)) x
    where coalesce(nullif(x->>'receivedBaseQty','')::numeric,
                   nullif(x->>'receivedQty','')::numeric, 0) > 0
  )) and coalesce(current_setting('app.receive_po_rpc', true), '') <> 'on' then
    raise exception 'Received purchase orders cannot be edited or deleted; post a return/correction'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists received_purchase_order_guard on public.purchase_orders;
create trigger received_purchase_order_guard
before update on public.purchase_orders
for each row execute function public.guard_received_purchase_order();
create or replace function public.guard_delete_received_purchase_order()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.status = 'received' or exists (
    select 1 from jsonb_array_elements(coalesce(old.lines, '[]'::jsonb)) x
    where coalesce(nullif(x->>'receivedBaseQty','')::numeric,
                   nullif(x->>'receivedQty','')::numeric, 0) > 0
  ) then
    raise exception 'Received purchase orders cannot be deleted; post a return/correction'
      using errcode = '42501';
  end if;
  return old;
end;
$$;
drop trigger if exists delete_received_purchase_order_guard on public.purchase_orders;
create trigger delete_received_purchase_order_guard
before delete on public.purchase_orders
for each row execute function public.guard_delete_received_purchase_order();

-- One transaction for a physical count/correction and its human-readable row.
create or replace function public.adjust_stock(
  p_item_id uuid,
  p_new_stock numeric,
  p_reason text default null,
  p_adjustment_type text default 'manual',
  p_effective_at timestamptz default now(),
  p_operation_id text default null,
  p_actor_id text default null,
  p_actor_name text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_item public.items; v_business uuid;
  v_old numeric; v_new numeric; v_delta numeric; v_id uuid;
  v_source text := coalesce(nullif(p_operation_id, ''), gen_random_uuid()::text);
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_profiles p where p.id = v_uid and
    (lower(coalesce(p.role,'')) in ('owner','admin') or coalesce(p.permissions::text,'') like '%inventory.adjust%'
      or coalesce(p.permissions::text,'') like '%inventory.edit%')) then
    raise exception 'inventory.adjust permission required' using errcode = '42501';
  end if;
  select * into v_item from public.items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  v_business := v_item.business_id;
  if v_business is not null and not public.is_member(v_business) then
    raise exception 'not a member of business %', v_business using errcode = '42501';
  end if;
  v_old := coalesce(v_item.stock, 0);
  v_new := greatest(0, coalesce(p_new_stock, 0));
  v_delta := v_new - v_old;

  if exists (select 1 from public.stock_movements where source_id = v_source
             and item_id = p_item_id and source_type in ('adjustment','stocktake','opening')) then
    select id into v_id from public.stock_adjustments where business_id = v_business
      and item_id = p_item_id
      and reason = p_reason and adjustment_date = p_effective_at::date
      and abs(qty_change - v_delta) < 0.0000001 order by created_at desc limit 1;
    return (select to_jsonb(a) from public.stock_adjustments a where a.id = v_id);
  end if;

  insert into public.stock_adjustments
    (business_id, item_id, item_name, adjustment_type, qty_change, old_stock,
     new_stock, reason, adjustment_date, created_by, created_by_name)
  values (v_business, p_item_id, v_item.name, coalesce(p_adjustment_type, 'manual'),
    v_delta, v_old, v_new, p_reason, p_effective_at::date,
    coalesce(p_actor_id, v_uid::text), p_actor_name)
  returning id into v_id;

  if v_delta <> 0 then
    perform set_config('app.stock_internal', 'on', true);
    perform public.post_stock_movements(jsonb_build_array(jsonb_build_object(
      'business_id', v_business, 'item_id', p_item_id, 'qty_base', v_delta,
      'source_type', case when p_adjustment_type = 'stocktake' then 'stocktake' when p_adjustment_type = 'opening' then 'opening' else 'adjustment' end,
      'source_id', v_source, 'source_line', 0, 'occurred_at', p_effective_at,
      'actor_id', coalesce(p_actor_id, v_uid::text), 'actor_name', p_actor_name,
      'reason', p_reason)), true);
  end if;
  return (select to_jsonb(a) from public.stock_adjustments a where a.id = v_id);
end;
$$;
grant execute on function public.adjust_stock(uuid, numeric, text, text, timestamptz, text, text, text) to authenticated;

-- Atomic settlement of a credit/partial sale. The row lock prevents two
-- cashiers from collecting the same balance concurrently.
create or replace function public.add_sale_payment(
  p_sale_id uuid, p_amount numeric, p_method text, p_received_by text,
  p_received_by_name text, p_notes text default null, p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_sale public.sales; v_amount numeric;
  v_due numeric; v_status text; v_doc text; v_business uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  v_business := v_sale.business_id;
  if v_business is not null and not public.is_member(v_business) then
    raise exception 'not a member of business %', v_business using errcode = '42501';
  end if;
  if v_sale.voided_at is not null then raise exception 'This sale was voided'; end if;
  if p_idempotency_key is not null and exists (
    select 1 from public.sale_payments where sale_id = p_sale_id
      and notes = 'payment-operation:' || p_idempotency_key
  ) then return to_jsonb(v_sale); end if;
  v_amount := least(greatest(coalesce(p_amount, 0), 0), greatest(coalesce(v_sale.amount_due, 0), 0));
  if v_amount <= 0 then raise exception 'Nothing due on this sale'; end if;
  insert into public.sale_payments
    (sale_id, business_id, amount, payment_method, received_by, received_by_name, notes)
  values (p_sale_id, v_business, v_amount, p_method, p_received_by, p_received_by_name,
    coalesce(p_notes, '') || case when p_idempotency_key is null then '' else ' payment-operation:' || p_idempotency_key end);
  v_due := greatest(0, coalesce(v_sale.total, 0) - coalesce(v_sale.amount_paid, 0) - v_amount);
  v_status := case when v_due <= 0 then 'paid' else 'partial' end;
  v_doc := case when v_due <= 0 then 'receipt' else 'invoice' end;
  update public.sales set amount_paid = coalesce(amount_paid, 0) + v_amount,
    amount_due = v_due, payment_status = v_status, document_type = v_doc
    where id = p_sale_id returning * into v_sale;
  return to_jsonb(v_sale);
end;
$$;
grant execute on function public.add_sale_payment(uuid, numeric, text, text, text, text, text) to authenticated;

-- Atomic PO receipt. The browser may prepare the display payload, but the PO
-- row is locked before it is changed and stock is posted in this transaction.
create or replace function public.receive_purchase_order(
  p_po_id uuid, p_lines jsonb, p_status text, p_received_at timestamptz,
  p_movements jsonb, p_cost_updates jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_po public.purchase_orders; v jsonb; v_item uuid; v_cost numeric;
begin
  select * into v_po from public.purchase_orders where id = p_po_id for update;
  if not found then raise exception 'Purchase order not found' using errcode = 'P0002'; end if;
  if v_po.business_id is not null and not public.is_member(v_po.business_id) then
    raise exception 'not a member of business %', v_po.business_id using errcode = '42501';
  end if;
  if v_po.status = 'received' then raise exception 'This purchase order was already fully received'; end if;
  perform set_config('app.receive_po_rpc', 'on', true);
  perform set_config('app.stock_internal', 'on', true);
  update public.purchase_orders set lines = p_lines, status = p_status,
    received_at = p_received_at, updated_at = now() where id = p_po_id;
  for v in select value from jsonb_array_elements(coalesce(p_cost_updates, '[]'::jsonb)) loop
    v_item := nullif(v->>'item_id', '')::uuid; v_cost := nullif(v->>'cost', '')::numeric;
    if v_item is not null and v_cost is not null then
      update public.items set cost = v_cost, updated_at = now()
        where id = v_item and business_id is not distinct from v_po.business_id;
    end if;
  end loop;
  perform public.post_stock_movements(p_movements, true);
  return (select to_jsonb(p) from public.purchase_orders p where p.id = p_po_id);
end;
$$;
grant execute on function public.receive_purchase_order(uuid, jsonb, text, timestamptz, jsonb, jsonb) to authenticated;

-- A void reverses the exact original movement rows. Current BOM/UOM settings
-- are never consulted, so deleted or edited catalog items remain reversible.
create or replace function public.void_sale(
  p_sale_id uuid, p_reason text default null, p_movements jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_sale public.sales; v_allowed boolean; v_name text;
  v_json jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  if v_sale.voided_at is not null then raise exception 'This sale is already voided'; end if;
  if v_sale.business_id is not null and not public.is_member(v_sale.business_id) then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;
  select exists(select 1 from public.user_profiles p where p.id = v_uid and
    (lower(coalesce(p.role,'')) in ('owner','admin') or coalesce(p.permissions::text,'') like '%sales.void%')) into v_allowed;
  if not v_allowed then raise exception 'sales.void permission required' using errcode = '42501'; end if;
  select username into v_name from public.user_profiles where id = v_uid;
  perform set_config('app.sale_void_rpc', 'on', true);
  perform set_config('app.stock_internal', 'on', true);
  update public.sales set voided_at = now(), voided_by = v_uid, voided_by_name = v_name,
    void_reason = nullif(btrim(coalesce(p_reason,'')), '') where id = p_sale_id returning * into v_sale;
  if exists (select 1 from public.stock_movements m
             where m.source_type = 'sale' and m.source_id = p_sale_id::text
               and m.item_id is null) then
    raise exception 'This sale references a deleted inventory item; restore/archive the item before voiding'
      using errcode = 'P0001';
  end if;
  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id', m.business_id, 'branch_id', m.branch_id, 'item_id', m.item_id,
    'qty_base', -m.qty_base, 'unit_cost', m.unit_cost, 'source_type', 'sale_void',
    'source_id', p_sale_id::text, 'source_line', m.source_line,
    'occurred_at', now(), 'actor_id', v_uid::text, 'actor_name', v_name,
    'reason', 'Voided sale ' || v_sale.number || ' - stock returned',
    'reversal_of', m.id)), '[]'::jsonb) into v_json
    from public.stock_movements m where m.source_type = 'sale' and m.source_id = p_sale_id::text;
  perform public.post_stock_movements(v_json, true);
  if exists(select 1 from public.sale_payments where sale_id = v_sale.id and amount > 0) then
    insert into public.sale_payments (business_id, sale_id, amount, payment_method, received_by, received_by_name, notes)
      select v_sale.business_id, null, -abs(p.amount), p.payment_method, v_uid, v_name,
        'Void refund - sale ' || v_sale.number from public.sale_payments p
        where p.sale_id = v_sale.id and p.amount > 0;
  elsif coalesce(v_sale.amount_paid,0) > 0 then
    insert into public.sale_payments (business_id, sale_id, amount, payment_method, received_by, received_by_name, notes)
      values (v_sale.business_id, null, -abs(v_sale.amount_paid),
        case when v_sale.payment_method = 'partial' then 'cash' else v_sale.payment_method end,
        v_uid, v_name, 'Void refund - sale ' || v_sale.number);
  end if;
  if v_sale.customer_id is not null then
    update public.customers set total_spent = coalesce(total_spent,0) - coalesce(v_sale.total,0),
      loyalty_points = coalesce(loyalty_points,0) - coalesce(v_sale.loyalty_earned,0) + coalesce(v_sale.loyalty_redeemed,0)
      where id = v_sale.customer_id;
    if coalesce(v_sale.loyalty_earned,0) <> coalesce(v_sale.loyalty_redeemed,0) then
      insert into public.loyalty_transactions (business_id, customer_id, sale_id, points, type, notes, created_by)
        values (v_sale.business_id, v_sale.customer_id, v_sale.id,
          coalesce(v_sale.loyalty_redeemed,0)-coalesce(v_sale.loyalty_earned,0), 'adjust',
          'Void of sale ' || v_sale.number, v_uid);
    end if;
  end if;
  return to_jsonb(v_sale);
end;
$$;
grant execute on function public.void_sale(uuid, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
