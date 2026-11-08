-- Void hardening: never let deleted catalogue rows block a reversal.
--
-- `void_sale` reverses the exact stock movements recorded for the sale. Two
-- legacy-data cases made it fail with a 400:
--
--   • a movement's item was deleted after the sale (item_id is null, or the
--     row is orphaned) and the function raised
--     "This sale references a deleted inventory item…";
--   • a movement had no business_id (older rows), which tripped the tenant
--     guard with "Stock movement business does not match item".
--
-- Neither can restore stock — there is no item row left — so skip those lines
-- and reverse everything that still exists. Also skip the customer/loyalty
-- unwind when the customer row is gone, and make sure refund rows are allowed
-- to have a null sale_id (payment reversals are unlinked by design).
--
-- Idempotent: safe to re-run.

alter table public.sale_payments alter column sale_id drop not null;

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

  -- Only movements whose item still exists can be reversed. Deleted items have
  -- no stock row to credit back, so they are skipped rather than aborting the
  -- whole void. Missing business_id falls back to the sale's business so the
  -- tenant guard accepts the reversal.
  select coalesce(jsonb_agg(jsonb_build_object(
    'business_id', coalesce(m.business_id, v_sale.business_id),
    'branch_id', coalesce(m.branch_id, v_sale.branch_id),
    'item_id', m.item_id,
    'qty_base', -m.qty_base, 'unit_cost', m.unit_cost, 'source_type', 'sale_void',
    'source_id', p_sale_id::text, 'source_line', m.source_line,
    'occurred_at', now(), 'actor_id', v_uid::text, 'actor_name', v_name,
    'reason', 'Voided sale ' || v_sale.number || ' - stock returned',
    'reversal_of', m.id)), '[]'::jsonb) into v_json
    from public.stock_movements m
    where m.source_type = 'sale' and m.source_id = p_sale_id::text
      and m.item_id is not null
      and exists (select 1 from public.items i where i.id = m.item_id);
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

  if v_sale.customer_id is not null
     and exists (select 1 from public.customers c where c.id = v_sale.customer_id) then
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
