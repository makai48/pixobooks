-- Authoritative accounting controls. Run after 20261103000006.

create table if not exists public.accounting_periods (
  business_id uuid not null,
  period_start date not null,
  period_end date not null,
  status text not null default 'open' check (status in ('open','closed')),
  closed_at timestamptz,
  closed_by uuid,
  reason text,
  primary key (business_id, period_start, period_end),
  check (period_start <= period_end)
);
alter table public.accounting_periods enable row level security;
drop policy if exists accounting_periods_member_read on public.accounting_periods;
create policy accounting_periods_member_read on public.accounting_periods
  for select to authenticated using (public.is_member(business_id));

create or replace function public.set_accounting_period_status(
  p_business_id uuid, p_period_start date, p_period_end date,
  p_status text, p_reason text default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_row public.accounting_periods;
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if not public.is_member(p_business_id) then raise exception 'not a member of business %',p_business_id using errcode='42501'; end if;
  if not exists (select 1 from public.user_profiles p where p.id=v_uid and lower(coalesce(p.role,'')) in ('owner','admin')) then
    raise exception 'Only an owner or administrator may change accounting periods' using errcode='42501';
  end if;
  if p_status not in ('open','closed') then raise exception 'Invalid accounting period status'; end if;
  insert into public.accounting_periods (business_id,period_start,period_end,status,closed_at,closed_by,reason)
    values(p_business_id,p_period_start,p_period_end,p_status,case when p_status='closed' then now() else null end,
      case when p_status='closed' then v_uid else null end,p_reason)
  on conflict (business_id,period_start,period_end) do update set status=excluded.status,
    closed_at=excluded.closed_at,closed_by=excluded.closed_by,reason=excluded.reason
  returning * into v_row;
  return to_jsonb(v_row);
end;
$$;
grant execute on function public.set_accounting_period_status(uuid,date,date,text,text) to authenticated;

create or replace function public.assert_stock_period_open()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if exists (select 1 from public.accounting_periods p
    where p.business_id = new.business_id and p.status = 'closed'
      and new.occurred_at::date between p.period_start and p.period_end) then
    raise exception 'Accounting period is closed for this stock movement date'
      using errcode = '55000';
  end if;
  return new;
end;
$$;
drop trigger if exists stock_period_open_guard on public.stock_movements;
create trigger stock_period_open_guard
before insert on public.stock_movements
for each row execute function public.assert_stock_period_open();

create table if not exists public.item_branch_stock (
  business_id uuid not null,
  branch_id uuid not null,
  item_id uuid not null references public.items(id) on delete restrict,
  qty numeric not null default 0,
  updated_at timestamptz not null default now(),
  primary key (business_id, branch_id, item_id)
);
alter table public.item_branch_stock enable row level security;
drop policy if exists item_branch_stock_member_read on public.item_branch_stock;
create policy item_branch_stock_member_read on public.item_branch_stock
  for select to authenticated using (public.is_member(business_id));

create table if not exists public.inventory_valuation_events (
  movement_id uuid primary key references public.stock_movements(id) on delete restrict,
  business_id uuid,
  item_id uuid,
  qty_base numeric not null,
  unit_cost numeric not null default 0,
  value numeric not null default 0,
  created_at timestamptz not null default now()
);
alter table public.inventory_valuation_events enable row level security;
drop policy if exists inventory_valuation_member_read on public.inventory_valuation_events;
create policy inventory_valuation_member_read on public.inventory_valuation_events
  for select to authenticated using (business_id is null or public.is_member(business_id));

create or replace function public.record_inventory_valuation()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_cost numeric;
begin
  select coalesce(new.unit_cost, i.cost, 0) into v_cost from public.items i where i.id = new.item_id;
  insert into public.inventory_valuation_events
    (movement_id,business_id,item_id,qty_base,unit_cost,value)
  values (new.id,new.business_id,new.item_id,new.qty_base,v_cost,abs(new.qty_base)*v_cost)
  on conflict (movement_id) do nothing;
  return new;
end;
$$;
drop trigger if exists inventory_valuation_event_insert on public.stock_movements;
create trigger inventory_valuation_event_insert
after insert on public.stock_movements
for each row execute function public.record_inventory_valuation();

create or replace function public.apply_branch_stock_movement()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.branch_id is not null then
    insert into public.item_branch_stock (business_id,branch_id,item_id,qty,updated_at)
      values (new.business_id,new.branch_id,new.item_id,new.qty_base,now())
    on conflict (business_id,branch_id,item_id) do update
      set qty = public.item_branch_stock.qty + excluded.qty,
          updated_at = now();
  end if;
  return new;
end;
$$;
drop trigger if exists branch_stock_movement_insert on public.stock_movements;
create trigger branch_stock_movement_insert
after insert on public.stock_movements
for each row execute function public.apply_branch_stock_movement();

create or replace function public.guard_stock_branch_tenant()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if new.branch_id is not null and not exists (
    select 1 from public.branches b where b.id = new.branch_id
      and b.business_id is not distinct from new.business_id
  ) then
    raise exception 'Stock movement branch does not belong to its business' using errcode='42501';
  end if;
  return new;
end;
$$;
drop trigger if exists stock_branch_tenant_guard on public.stock_movements;
create trigger stock_branch_tenant_guard
before insert on public.stock_movements
for each row execute function public.guard_stock_branch_tenant();

create or replace function public.audit_sale_void_transaction()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  if old.voided_at is null and new.voided_at is not null then
    insert into public.audit_logs
      (business_id,actor_id,actor_name,action,entity,entity_id,meta)
    values (new.business_id,new.voided_by,new.voided_by_name,'sale.void','sale',new.id,
      jsonb_build_object('number',new.number,'reason',new.void_reason,'total',new.total));
  end if;
  return new;
end;
$$;
drop trigger if exists audit_sale_void_transaction on public.sales;
create trigger audit_sale_void_transaction
after update on public.sales
for each row execute function public.audit_sale_void_transaction();

create or replace function public.audit_adjustment_transaction()
returns trigger language plpgsql security definer set search_path = public
as $$
begin
  insert into public.audit_logs
    (business_id,actor_id,actor_name,action,entity,entity_id,meta)
  values (new.business_id,new.created_by,new.created_by_name,'stock.adjust','item',new.item_id,
    jsonb_build_object('adjustment_id',new.id,'delta',new.qty_change,'old',new.old_stock,'new',new.new_stock,'reason',new.reason));
  return new;
end;
$$;
drop trigger if exists audit_adjustment_transaction on public.stock_adjustments;
create trigger audit_adjustment_transaction
after insert on public.stock_adjustments
for each row execute function public.audit_adjustment_transaction();

-- Server-side sale movement builder. It uses the stamped sale unit factor and
-- the item/BOM records inside the same transaction; p_movements from the
-- browser is intentionally ignored.
create or replace function public.build_sale_movements_authoritative(
  p_sale jsonb, p_sale_id uuid, p_business uuid, p_actor_id text, p_actor_name text
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare line jsonb; b jsonb; item public.items; mat public.items; v jsonb := '[]'::jsonb;
  v_item uuid; v_qty numeric; v_base numeric; v_component numeric; v_factor numeric;
  v_line integer := 0; v_ratio numeric;
begin
  for line in select value from jsonb_array_elements(coalesce(p_sale->'lines','[]'::jsonb)) loop
    v_item := nullif(coalesce(line->>'itemId',line->>'item_id'),'')::uuid;
    select * into item from public.items where id = v_item;
    if not found then raise exception 'Sale contains a missing inventory item' using errcode = '23514'; end if;
    if p_business is not null and item.business_id is distinct from p_business then
      raise exception 'Sale item belongs to another business' using errcode = '42501';
    end if;
    v_qty := coalesce(nullif(line->>'qty','')::numeric,0);
    v_factor := coalesce(nullif(line->>'unitFactor','')::numeric,1);
    v_base := v_qty * v_factor;
    if jsonb_array_length(coalesce(item.bom,'[]'::jsonb)) > 0 then
      for b in select value from jsonb_array_elements(item.bom) loop
        select * into mat from public.items where id = nullif(coalesce(b->>'materialId',b->>'material_id'),'')::uuid;
        if not found then raise exception 'Sale BOM contains a missing component' using errcode = '23514'; end if;
        v_component := coalesce(nullif(b->>'qty','')::numeric,0) * v_base;
        if nullif(b->>'unit','') is not null and lower(b->>'unit') <> lower(coalesce(mat.base_unit,'')) then
          select coalesce(nullif(u->>'ratio','')::numeric,1) into v_ratio
            from jsonb_array_elements(coalesce(mat.units,'[]'::jsonb)) u
            where lower(u->>'code') = lower(b->>'unit') limit 1;
          v_component := v_component * coalesce(v_ratio,1);
        end if;
        if v_component > 0 then
          v := v || jsonb_build_object('business_id',p_business,'item_id',mat.id,'qty_base',-v_component,
            'source_type','sale','source_id',p_sale_id::text,'source_line',v_line,
            'actor_id',p_actor_id,'actor_name',p_actor_name,'reason','Sale issued from stock');
          v_line := v_line + 1;
        end if;
      end loop;
      if item.item_type = 'intermediate' and v_base > 0 then
        v := v || jsonb_build_object('business_id',p_business,'item_id',item.id,'qty_base',-v_base,
          'source_type','sale','source_id',p_sale_id::text,'source_line',v_line,
          'actor_id',p_actor_id,'actor_name',p_actor_name,'reason','Sale issued from stock');
        v_line := v_line + 1;
      end if;
    elsif v_base > 0 then
      v := v || jsonb_build_object('business_id',p_business,'item_id',item.id,'qty_base',-v_base,
        'source_type','sale','source_id',p_sale_id::text,'source_line',v_line,
        'actor_id',p_actor_id,'actor_name',p_actor_name,'reason','Sale issued from stock');
      v_line := v_line + 1;
    end if;
  end loop;
  return v;
end;
$$;

-- Authoritative checkout RPC. This mirrors the existing accounting side
-- effects, but derives stock from the sale itself.
create or replace function public.commit_sale_authoritative(
  p_sale jsonb, p_payment jsonb default null
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare v_uid uuid := auth.uid(); v_business uuid := nullif(p_sale->>'business_id','')::uuid;
  v_existing public.sales; v_row public.sales; v_moves jsonb; v_customer uuid;
  v_total numeric := coalesce(nullif(p_sale->>'total','')::numeric,0);
  v_earned integer := coalesce(nullif(p_sale->>'loyalty_earned','')::integer,0);
  v_redeemed integer := coalesce(nullif(p_sale->>'loyalty_redeemed','')::integer,0);
begin
  if v_uid is null then raise exception 'authentication required' using errcode='42501'; end if;
  if v_business is not null and not public.is_member(v_business) then
    raise exception 'not a member of business %',v_business using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_business::text,'main'),0));
  select * into v_existing from public.sales where number=p_sale->>'number'
    and (v_business is null or business_id=v_business) limit 1;
  if found then return jsonb_build_object('sale',to_jsonb(v_existing),'duplicate',true); end if;
  insert into public.sales select * from jsonb_populate_record(null::public.sales,p_sale) returning * into v_row;
  if p_payment is not null and p_payment <> 'null'::jsonb then
    insert into public.sale_payments select * from jsonb_populate_record(null::public.sale_payments,
      p_payment || jsonb_build_object('sale_id',v_row.id));
  end if;
  v_moves := public.build_sale_movements_authoritative(p_sale,v_row.id,v_business,v_uid::text,p_sale->>'cashier_name');
  perform set_config('app.commit_sale_rpc','on',true);
  perform set_config('app.stock_internal','on',true);
  perform public.post_stock_movements(v_moves,true);
  v_customer := nullif(p_sale->>'customer_id','')::uuid;
  if v_customer is not null then
    update public.customers set total_spent=coalesce(total_spent,0)+v_total,
      loyalty_points=coalesce(loyalty_points,0)+v_earned-v_redeemed where id=v_customer;
    if v_earned <> 0 then insert into public.loyalty_transactions
      (business_id,customer_id,sale_id,points,type,notes,created_by)
      values(v_business,v_customer,v_row.id,v_earned,'earn','Earned from sale '||v_row.number,v_uid); end if;
    if v_redeemed <> 0 then insert into public.loyalty_transactions
      (business_id,customer_id,sale_id,points,type,notes,created_by)
      values(v_business,v_customer,v_row.id,-v_redeemed,'redeem','Redeemed on sale '||v_row.number,v_uid); end if;
  end if;
  update public.shop_settings s
    set invoice = jsonb_set(coalesce(s.invoice,'{}'::jsonb),'{nextNumber}',
      to_jsonb(coalesce((s.invoice->>'nextNumber')::integer,0)+1),true), updated_at=now()
    where (v_business is not null and s.business_id=v_business)
       or (v_business is null and s.id='main');
  if nullif(p_sale->>'cashier_id','') is not null then
    insert into public.attendance (business_id,employee_id,employee_name,date,status,hours,notes)
    select v_business,nullif(p_sale->>'cashier_id','')::uuid,p_sale->>'cashier_name',current_date,
      'present',8,'Auto-logged via sale '||v_row.number
    where not exists (select 1 from public.attendance a
      where a.employee_id=nullif(p_sale->>'cashier_id','')::uuid and a.date=current_date);
  end if;
  return jsonb_build_object('sale',to_jsonb(v_row),'duplicate',false);
end;
$$;
grant execute on function public.commit_sale_authoritative(jsonb,jsonb) to authenticated;
notify pgrst,'reload schema';
