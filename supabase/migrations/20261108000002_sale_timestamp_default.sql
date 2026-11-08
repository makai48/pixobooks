-- Checkout timestamp hardening.
--
-- `commit_sale_authoritative` inserts with
--   insert into public.sales select * from jsonb_populate_record(...)
-- which materialises EVERY column of the composite type. Columns absent from
-- the payload become NULL, so their DEFAULT (notably `created_at`) never runs
-- and the insert dies with
--   null value in column "created_at" of relation "sales" violates not-null.
--
-- Stamp a server fallback for the transaction timestamps before populating the
-- row. A client-supplied timestamp (offline replay) still wins, so a queued
-- sale keeps the moment it actually happened.
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
  insert into public.sales
  select * from jsonb_populate_record(
    null::public.sales,
    p_sale || jsonb_build_object(
      'created_at', coalesce(nullif(p_sale->>'created_at','')::timestamptz, now()),
      'updated_at', coalesce(nullif(p_sale->>'updated_at','')::timestamptz, now())
    )
  )
  returning * into v_row;
  if p_payment is not null and p_payment <> 'null'::jsonb then
    -- Populate the real columns explicitly (the same set `add_sale_payment`
    -- uses) so the table's own defaults supply id / created_at. Feeding the
    -- whole composite type through jsonb_populate_record would write NULL
    -- into every column the payload omits.
    insert into public.sale_payments
      (sale_id, business_id, amount, payment_method, received_by,
       received_by_name, notes)
    values (
      v_row.id,
      nullif(p_payment->>'business_id','')::uuid,
      coalesce(nullif(p_payment->>'amount','')::numeric, 0),
      nullif(p_payment->>'payment_method',''),
      nullif(p_payment->>'received_by','')::uuid,
      nullif(p_payment->>'received_by_name',''),
      nullif(p_payment->>'notes','')
    );
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
