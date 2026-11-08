-- Final void-sale repair.
--
-- Some deployed projects still have an older post_stock_movements function in
-- which actor_id is inserted as text. Redefining that helper is not enough if
-- the project did not run every historical migration. This version of
-- void_sale writes its reversal rows directly and passes the UUID variable
-- v_uid to the uuid actor_id column. Therefore voiding no longer depends on
-- the stale helper at all.

create or replace function public.void_sale(
  p_sale_id uuid, p_reason text default null, p_movements jsonb default '[]'::jsonb
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_sale public.sales;
  v_allowed boolean;
  v_name text;
  m record;
  v_id uuid;
  v_stock numeric;
begin
  if v_uid is null then
    raise exception 'authentication required' using errcode = '42501';
  end if;

  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then raise exception 'Sale not found' using errcode = 'P0002'; end if;
  if v_sale.voided_at is not null then raise exception 'This sale is already voided'; end if;
  if v_sale.business_id is not null and not public.is_member(v_sale.business_id) then
    raise exception 'not a member of this business' using errcode = '42501';
  end if;

  select exists(
    select 1 from public.user_profiles p
    where p.id = v_uid
      and (lower(coalesce(p.role,'')) in ('owner','admin')
        or coalesce(p.permissions::text,'') like '%sales.void%')
  ) into v_allowed;
  if not v_allowed then raise exception 'sales.void permission required' using errcode = '42501'; end if;
  select username into v_name from public.user_profiles where id = v_uid;

  perform set_config('app.sale_void_rpc', 'on', true);
  perform set_config('app.stock_ledger_rpc', 'on', true);
  update public.sales
    set voided_at = now(), voided_by = v_uid, voided_by_name = v_name,
        void_reason = nullif(btrim(coalesce(p_reason,'')), '')
    where id = p_sale_id
    returning * into v_sale;

  -- Reverse the original ledger rows, not the current BOM. Deleted catalogue
  -- rows are skipped because there is no stock cache left to restore.
  for m in
    select sm.*
    from public.stock_movements sm
    where sm.source_type = 'sale'
      and sm.source_id = p_sale_id::text
      and sm.item_id is not null
      and exists (select 1 from public.items i where i.id = sm.item_id)
  loop
    v_id := null;
    insert into public.stock_movements
      (business_id, branch_id, item_id, qty_base, unit_cost, source_type,
       source_id, source_line, occurred_at, actor_id, actor_name, reason,
       reversal_of)
    values
      (coalesce(m.business_id, v_sale.business_id),
       coalesce(m.branch_id, v_sale.branch_id),
       m.item_id, -m.qty_base, m.unit_cost, 'sale_void', p_sale_id::text,
       m.source_line, now(), v_uid, v_name,
       'Voided sale ' || v_sale.number || ' - stock returned', m.id)
    on conflict (source_type, source_id, item_id, source_line) do nothing
    returning id into v_id;

    if v_id is not null then
      update public.items
        set stock = coalesce(stock,0) - m.qty_base, updated_at = now()
        where id = m.item_id
        returning stock into v_stock;
    end if;
  end loop;

  if exists(select 1 from public.sale_payments where sale_id = v_sale.id and amount > 0) then
    insert into public.sale_payments
      (business_id, sale_id, amount, payment_method, received_by, received_by_name, notes)
    select v_sale.business_id, null, -abs(p.amount), p.payment_method, v_uid, v_name,
      'Void refund - sale ' || v_sale.number
    from public.sale_payments p where p.sale_id = v_sale.id and p.amount > 0;
  elsif coalesce(v_sale.amount_paid,0) > 0 then
    insert into public.sale_payments
      (business_id, sale_id, amount, payment_method, received_by, received_by_name, notes)
    values (v_sale.business_id, null, -abs(v_sale.amount_paid),
      case when v_sale.payment_method = 'partial' then 'cash' else v_sale.payment_method end,
      v_uid, v_name, 'Void refund - sale ' || v_sale.number);
  end if;

  if v_sale.customer_id is not null
     and exists (select 1 from public.customers c where c.id = v_sale.customer_id) then
    update public.customers
      set total_spent = coalesce(total_spent,0) - coalesce(v_sale.total,0),
          loyalty_points = coalesce(loyalty_points,0)
            - coalesce(v_sale.loyalty_earned,0) + coalesce(v_sale.loyalty_redeemed,0)
      where id = v_sale.customer_id;
    if coalesce(v_sale.loyalty_earned,0) <> coalesce(v_sale.loyalty_redeemed,0) then
      insert into public.loyalty_transactions
        (business_id, customer_id, sale_id, points, type, notes, created_by)
      values (v_sale.business_id, v_sale.customer_id, v_sale.id,
        coalesce(v_sale.loyalty_redeemed,0)-coalesce(v_sale.loyalty_earned,0),
        'adjust', 'Void of sale ' || v_sale.number, v_uid);
    end if;
  end if;

  return to_jsonb(v_sale);
end;
$$;

grant execute on function public.void_sale(uuid, text, jsonb) to authenticated;
notify pgrst, 'reload schema';
