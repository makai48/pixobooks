-- Final integrity hardening.
-- Run after 20261103000003.  The client deliberately fails closed if these
-- functions are unavailable; there is no safe non-ledger compatibility path.

-- A void refund is a standalone cash movement, so legacy schemas that made
-- the sale link mandatory are brought to the same explicit contract.
alter table public.sale_payments alter column sale_id drop not null;

-- Do not permit API clients to alter the void columns directly.  The guarded
-- transaction-local flag is set only inside void_sale below.
create or replace function public.prevent_direct_sale_void_update()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.voided_at, new.voided_by, new.voided_by_name, new.void_reason)
       is distinct from
     (old.voided_at, old.voided_by, old.voided_by_name, old.void_reason)
     and coalesce(current_setting('app.sale_void_rpc', true), '') <> 'on' then
    raise exception 'sales void fields may only be changed by void_sale'
      using errcode = '42501';
  end if;
  return new;
end;
$$;

drop trigger if exists sales_void_fields_guard on public.sales;
create trigger sales_void_fields_guard
before update on public.sales
for each row execute function public.prevent_direct_sale_void_update();

-- Sale movements are not general-purpose adjustments. They can only be
-- emitted by the matching transaction, which prevents a client from calling
-- post_stock_movements directly with a forged sale source.
create or replace function public.guard_sale_stock_movement()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_sale public.sales;
begin
  if new.source_type = 'sale' then
    if coalesce(current_setting('app.commit_sale_rpc', true), '') <> 'on'
       or new.qty_base >= 0 then
      raise exception 'sale stock movements may only be posted by commit_sale'
        using errcode = '42501';
    end if;
    select * into v_sale from public.sales where id::text = new.source_id;
    if not found or v_sale.voided_at is not null
       or v_sale.business_id is distinct from new.business_id then
      raise exception 'sale movement does not match its sale' using errcode = '42501';
    end if;
  elsif new.source_type = 'sale_void' then
    if coalesce(current_setting('app.sale_void_rpc', true), '') <> 'on'
       or new.qty_base <= 0 then
      raise exception 'sale void movements may only be posted by void_sale'
        using errcode = '42501';
    end if;
    select * into v_sale from public.sales where id::text = new.source_id;
    if not found or v_sale.business_id is distinct from new.business_id then
      raise exception 'void movement does not match its sale' using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;
drop trigger if exists stock_sale_source_guard on public.stock_movements;
create trigger stock_sale_source_guard
before insert on public.stock_movements
for each row execute function public.guard_sale_stock_movement();

-- Atomic checkout including all balance-sheet side effects that used to be
-- separate browser writes.  The document number is locked per business so two
-- tills cannot race between the duplicate check and insert.
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
  v_uid uuid := auth.uid();
  v_business uuid := nullif(p_sale->>'business_id', '')::uuid;
  v_existing public.sales;
  v_row public.sales;
  v_customer uuid := nullif(p_sale->>'customer_id', '')::uuid;
  v_total numeric := coalesce(nullif(p_sale->>'total', '')::numeric, 0);
  v_earned integer := coalesce(nullif(p_sale->>'loyalty_earned', '')::integer, 0);
  v_redeemed integer := coalesce(nullif(p_sale->>'loyalty_redeemed', '')::integer, 0);
  v_invoice jsonb;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  if v_business is not null and not public.is_member(v_business) then
    raise exception 'not a member of business %', v_business using errcode = '42501';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(coalesce(v_business::text, 'main'), 0));

  select * into v_existing from public.sales
   where number = p_sale->>'number'
     and (v_business is null or business_id = v_business) limit 1;
  if found then
    return jsonb_build_object('sale', to_jsonb(v_existing), 'duplicate', true);
  end if;

  insert into public.sales
  select * from jsonb_populate_record(null::public.sales, p_sale)
  returning * into v_row;

  if p_payment is not null and p_payment <> 'null'::jsonb then
    insert into public.sale_payments
    select * from jsonb_populate_record(null::public.sale_payments,
      p_payment || jsonb_build_object('sale_id', v_row.id));
  end if;
  perform set_config('app.commit_sale_rpc', 'on', true);
  perform public.post_stock_movements(p_movements, true);

  if v_customer is not null then
    update public.customers
      set total_spent = coalesce(total_spent, 0) + v_total,
          loyalty_points = coalesce(loyalty_points, 0) + v_earned - v_redeemed
      where id = v_customer;
    if v_earned <> 0 then
      insert into public.loyalty_transactions
        (business_id, customer_id, sale_id, points, type, notes, created_by)
      values (v_business, v_customer, v_row.id, v_earned, 'earn',
        'Earned from sale ' || coalesce(p_sale->>'number', ''), v_uid);
    end if;
    if v_redeemed <> 0 then
      insert into public.loyalty_transactions
        (business_id, customer_id, sale_id, points, type, notes, created_by)
      values (v_business, v_customer, v_row.id, -v_redeemed, 'redeem',
        'Redeemed on sale ' || coalesce(p_sale->>'number', ''), v_uid);
    end if;
  end if;

  -- The JSON invoice object is the existing settings contract. Locking the
  -- row makes the serial sequence correct across concurrent tills.
  select invoice into v_invoice from public.shop_settings
   where (v_business is not null and business_id = v_business)
      or (v_business is null and id = 'main') for update;
  if v_invoice is not null then
    update public.shop_settings
      set invoice = jsonb_set(v_invoice, '{nextNumber}',
        to_jsonb(coalesce((v_invoice->>'nextNumber')::integer, 0) + 1), true),
          updated_at = now()
      where (v_business is not null and business_id = v_business)
         or (v_business is null and id = 'main');
  end if;

  if p_sale ? 'cashier_id' and nullif(p_sale->>'cashier_id', '') is not null then
    insert into public.attendance
      (business_id, employee_id, employee_name, date, status, hours, notes)
    select v_business, nullif(p_sale->>'cashier_id', '')::uuid,
      p_sale->>'cashier_name', current_date, 'present', 8,
      'Auto-logged via sale ' || coalesce(p_sale->>'number', '')
    where not exists (
      select 1 from public.attendance a
       where a.employee_id = nullif(p_sale->>'cashier_id', '')::uuid
         and a.date = current_date
    );
  end if;
  return jsonb_build_object('sale', to_jsonb(v_row), 'duplicate', false);
end;
$$;
grant execute on function public.commit_sale(jsonb, jsonb, jsonb) to authenticated;

-- Atomic void: reversal stock, refund cash, customer totals and loyalty are
-- one accounting event. A refund row is dated now, never back-dated to the
-- original sale, so closed cash days remain immutable.
create or replace function public.void_sale(
  p_sale_id uuid,
  p_reason text default null,
  p_movements jsonb default '[]'::jsonb
)
returns jsonb
language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid(); v_sale public.sales; v_allowed boolean; v_name text;
  v_customer uuid; v_business uuid; v_amount numeric; v_method text;
begin
  if v_uid is null then raise exception 'authentication required' using errcode = '42501'; end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  if v_sale.voided_at is not null then raise exception 'This sale is already voided'; end if;
  v_business := v_sale.business_id;
  if v_business is not null and not public.is_member(v_business) then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;
  select exists(select 1 from public.user_profiles p where p.id = v_uid and
    (lower(coalesce(p.role, '')) in ('owner','admin') or coalesce(p.permissions::text,'') like '%sales.void%')) into v_allowed;
  if not v_allowed then raise exception 'sales.void permission required' using errcode = '42501'; end if;
  select username into v_name from public.user_profiles where id = v_uid;

  perform set_config('app.sale_void_rpc', 'on', true);
  update public.sales set voided_at = now(), voided_by = v_uid,
    voided_by_name = v_name, void_reason = nullif(btrim(coalesce(p_reason,'')), '')
    where id = p_sale_id returning * into v_sale;
  perform public.post_stock_movements(p_movements, true);

  -- Reverse each recorded payment using its original method. This matters for
  -- credit/partial sales settled over several days or with mixed methods.
  if exists (select 1 from public.sale_payments where sale_id = v_sale.id and amount > 0) then
    insert into public.sale_payments
      (business_id, sale_id, amount, payment_method, received_by, received_by_name, notes)
    select v_business, null, -abs(p.amount), p.payment_method, v_uid, v_name,
      'Void refund - sale ' || v_sale.number
      from public.sale_payments p where p.sale_id = v_sale.id and p.amount > 0;
  else
    v_amount := coalesce(v_sale.amount_paid, 0);
    v_method := case when v_sale.payment_method = 'partial' then 'cash' else v_sale.payment_method end;
  end if;
  if not exists (select 1 from public.sale_payments where sale_id = v_sale.id and amount > 0)
     and v_amount > 0 then
    insert into public.sale_payments
      (business_id, sale_id, amount, payment_method, received_by, received_by_name, notes)
    values (v_business, null, -abs(v_amount), v_method, v_uid, v_name,
      'Void refund - sale ' || v_sale.number);
  end if;

  v_customer := v_sale.customer_id;
  if v_customer is not null then
    update public.customers set total_spent = coalesce(total_spent, 0) - v_sale.total,
      loyalty_points = coalesce(loyalty_points, 0) - coalesce(v_sale.loyalty_earned,0)
        + coalesce(v_sale.loyalty_redeemed,0) where id = v_customer;
    if coalesce(v_sale.loyalty_earned,0) <> coalesce(v_sale.loyalty_redeemed,0) then
      insert into public.loyalty_transactions
        (business_id, customer_id, sale_id, points, type, notes, created_by)
      values (v_business, v_customer, v_sale.id,
        coalesce(v_sale.loyalty_redeemed,0) - coalesce(v_sale.loyalty_earned,0),
        'adjust', 'Void of sale ' || v_sale.number, v_uid);
    end if;
  end if;
  return to_jsonb(v_sale);
end;
$$;
grant execute on function public.void_sale(uuid, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
