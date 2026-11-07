-- Final cleanup for retry identity and remaining direct-stock bypasses.
-- Run after 20261103000005.

alter table public.sale_payments
  add column if not exists idempotency_key text;
create unique index if not exists sale_payments_idempotency_idx
  on public.sale_payments (business_id, idempotency_key)
  where idempotency_key is not null;

alter table public.stock_adjustments
  add column if not exists operation_id text;
create unique index if not exists stock_adjustments_operation_idx
  on public.stock_adjustments (business_id, operation_id)
  where operation_id is not null;

create or replace function public.adjust_stock(
  p_item_id uuid, p_new_stock numeric, p_reason text default null,
  p_adjustment_type text default 'manual', p_effective_at timestamptz default now(),
  p_operation_id text default null, p_actor_id text default null, p_actor_name text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_item public.items; v_business uuid;
  v_old numeric; v_new numeric; v_delta numeric; v_id uuid;
  v_source text := coalesce(nullif(p_operation_id,''), gen_random_uuid()::text);
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if not exists (select 1 from public.user_profiles p where p.id = v_uid and
    (lower(coalesce(p.role,'')) in ('owner','admin') or coalesce(p.permissions::text,'') like '%inventory.adjust%'
      or coalesce(p.permissions::text,'') like '%inventory.edit%'
      or coalesce(p.permissions::text,'') like '%inventory.import%')) then
    raise exception 'inventory.adjust permission required' using errcode = '42501';
  end if;
  select * into v_item from public.items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  v_business := v_item.business_id;
  if v_business is not null and not public.is_member(v_business) then
    raise exception 'not a member of business %', v_business using errcode = '42501';
  end if;
  if p_operation_id is not null then
    select id into v_id from public.stock_adjustments
      where business_id is not distinct from v_business and operation_id = p_operation_id;
    if v_id is not null then return (select to_jsonb(a) from public.stock_adjustments a where a.id = v_id); end if;
  end if;
  v_old := coalesce(v_item.stock,0); v_new := greatest(0,coalesce(p_new_stock,0)); v_delta := v_new-v_old;
  insert into public.stock_adjustments
    (business_id,item_id,item_name,adjustment_type,qty_change,old_stock,new_stock,reason,
     adjustment_date,created_by,created_by_name,operation_id)
  values (v_business,p_item_id,v_item.name,coalesce(p_adjustment_type,'manual'),v_delta,v_old,v_new,
    p_reason,p_effective_at::date,coalesce(p_actor_id,v_uid::text),p_actor_name,p_operation_id)
  returning id into v_id;
  if v_delta <> 0 then
    perform set_config('app.stock_internal','on',true);
    perform public.post_stock_movements(jsonb_build_array(jsonb_build_object(
      'business_id',v_business,'item_id',p_item_id,'qty_base',v_delta,
      'source_type',case when p_adjustment_type='stocktake' then 'stocktake' when p_adjustment_type='opening' then 'opening' else 'adjustment' end,
      'source_id',v_source,'source_line',0,'occurred_at',p_effective_at,
      'actor_id',coalesce(p_actor_id,v_uid::text),'actor_name',p_actor_name,'reason',p_reason)),true);
  end if;
  return (select to_jsonb(a) from public.stock_adjustments a where a.id=v_id);
end;
$$;
grant execute on function public.adjust_stock(uuid,numeric,text,text,timestamptz,text,text,text) to authenticated;

-- Nonzero item inserts must also be ledger-authorized. New catalogue records
-- should be inserted at zero and opened through adjust_stock.
create or replace function public.guard_item_stock_insert()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if coalesce(new.stock, 0) <> 0
     and coalesce(current_setting('app.stock_ledger_rpc', true), '') <> 'on' then
    raise exception 'Nonzero item stock must be opened through the inventory ledger'
      using errcode = '42501';
  end if;
  return new;
end;
$$;
drop trigger if exists item_stock_insert_guard on public.items;
create trigger item_stock_insert_guard
before insert on public.items
for each row execute function public.guard_item_stock_insert();

create or replace function public.ensure_stock_ledger_config()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.business_id is not null then
    insert into public.stock_ledger_config (business_id) values (new.business_id)
      on conflict (business_id) do nothing;
  end if;
  return new;
end;
$$;
drop trigger if exists ensure_stock_ledger_config_on_item on public.items;
create trigger ensure_stock_ledger_config_on_item
after insert on public.items
for each row execute function public.ensure_stock_ledger_config();

create or replace function public.guard_sale_line_items()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v jsonb; v_item uuid; v_item_business uuid;
begin
  for v in select value from jsonb_array_elements(coalesce(new.lines, '[]'::jsonb)) loop
    v_item := nullif(coalesce(v->>'itemId', v->>'item_id'), '')::uuid;
    if v_item is null then raise exception 'Sale contains a line without an item' using errcode = '23514'; end if;
    select business_id into v_item_business from public.items where id = v_item;
    if not found then raise exception 'Sale contains a missing inventory item' using errcode = '23514'; end if;
    if new.business_id is not null and v_item_business is distinct from new.business_id then
      raise exception 'Sale line item belongs to another business' using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;
drop trigger if exists sale_line_items_guard on public.sales;
create trigger sale_line_items_guard
before insert or update on public.sales
for each row execute function public.guard_sale_line_items();

-- Import uses the live item lock and applies either an absolute target or a
-- quantity addition. This removes the browser read/update race.
create or replace function public.import_stock(
  p_item_id uuid,
  p_quantity numeric,
  p_mode text default 'set',
  p_reason text default null,
  p_operation_id text default null,
  p_actor_id text default null,
  p_actor_name text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_item public.items; v_target numeric; v_uid uuid := auth.uid(); v_result jsonb; v_adjustment_id uuid;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_item from public.items where id = p_item_id for update;
  if not found then raise exception 'Inventory item not found' using errcode = 'P0002'; end if;
  if v_item.business_id is not null and not public.is_member(v_item.business_id) then
    raise exception 'not a member of business %', v_item.business_id using errcode = '42501';
  end if;
  if p_operation_id is not null and exists (
    select 1 from public.stock_adjustments where business_id = v_item.business_id
      and operation_id = p_operation_id
  ) then
    return (select to_jsonb(a) from public.stock_adjustments a
      where a.business_id = v_item.business_id and a.operation_id = p_operation_id);
  end if;
  v_target := case when p_mode = 'add'
    then coalesce(v_item.stock, 0) + coalesce(p_quantity, 0)
    else greatest(0, coalesce(p_quantity, 0)) end;
  v_result := public.adjust_stock(
    p_item_id, v_target, p_reason, case when p_mode = 'set' then 'adjustment' else 'adjustment' end,
    now(), p_operation_id, p_actor_id, p_actor_name
  );
  v_adjustment_id := nullif(v_result->>'id', '')::uuid;
  if v_adjustment_id is not null then
    update public.stock_adjustments set operation_id = p_operation_id where id = v_adjustment_id;
  end if;
  return v_result;
end;
$$;
grant execute on function public.import_stock(uuid, numeric, text, text, text, text, text) to authenticated;

-- Make payment idempotency a real column rather than a notes convention.
create or replace function public.add_sale_payment(
  p_sale_id uuid, p_amount numeric, p_method text, p_received_by text,
  p_received_by_name text, p_notes text default null, p_idempotency_key text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_sale public.sales; v_amount numeric;
  v_due numeric; v_business uuid;
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
    select 1 from public.sale_payments where business_id is not distinct from v_business
      and idempotency_key = p_idempotency_key
  ) then return to_jsonb(v_sale); end if;
  if p_method not in ('cash','card','transfer','credit') then
    raise exception 'Unsupported payment method';
  end if;
  if coalesce(p_amount, 0) <= 0 or p_amount > coalesce(v_sale.amount_due, 0) then
    raise exception 'Payment must be greater than zero and no greater than the outstanding balance';
  end if;
  v_amount := p_amount;
  insert into public.sale_payments
    (sale_id, business_id, amount, payment_method, received_by, received_by_name, notes, idempotency_key)
  values (p_sale_id, v_business, v_amount, p_method, v_uid, p_received_by_name, p_notes, p_idempotency_key);
  v_due := greatest(0, coalesce(v_sale.total,0) - coalesce(v_sale.amount_paid,0) - v_amount);
  update public.sales set amount_paid = coalesce(amount_paid,0) + v_amount,
    amount_due = v_due, payment_status = case when v_due = 0 then 'paid' else 'partial' end,
    document_type = case when v_due = 0 then 'receipt' else 'invoice' end
    where id = p_sale_id returning * into v_sale;
  return to_jsonb(v_sale);
end;
$$;
grant execute on function public.add_sale_payment(uuid, numeric, text, text, text, text, text) to authenticated;
notify pgrst, 'reload schema';
