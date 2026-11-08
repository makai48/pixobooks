-- Final actor-id compatibility fix.
--
-- Some projects were created with stock_movements.actor_id as text while
-- others already have it as uuid. `create table if not exists` does not
-- reconcile that difference, and the deployed post_stock_movements function
-- in the older path inserted the JSON text expression directly. This
-- migration normalises the column and replaces the writer in one migration.
-- It is intentionally self-contained: applying only this migration fixes
-- existing installations regardless of which earlier ledger migration they
-- applied.

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'stock_movements'
      and column_name = 'actor_id'
      and udt_name <> 'uuid'
  ) then
    alter table public.stock_movements
      alter column actor_id type uuid
      using case
        when actor_id is null or btrim(actor_id::text) = '' then null
        when actor_id::text ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
          then actor_id::uuid
        else null
      end;
  end if;
end $$;

create or replace function public.post_stock_movements(
  p_movements jsonb, p_apply boolean default true
)
returns jsonb language plpgsql security definer set search_path = public
as $$
declare
  m jsonb; v_id uuid; v_item uuid; v_qty numeric; v_stock numeric;
  v_business uuid; v_actor uuid; v_results jsonb := '[]'::jsonb;
begin
  if auth.uid() is not null
     and coalesce(current_setting('app.stock_internal', true), '') <> 'on'
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
    if v_business is null then
      select i.business_id into v_business from public.items i where i.id = v_item;
    end if;
    if auth.uid() is not null and v_business is not null
       and not public.is_member(v_business) then
      raise exception 'not a member of business %', v_business using errcode = '42501';
    end if;

    -- Cast once before the INSERT. Invalid legacy actor values are treated as
    -- unknown rather than allowing an unrelated void/checkout to fail.
    v_actor := case
      when nullif(btrim(m->>'actor_id'), '') is null then null
      when btrim(m->>'actor_id') ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then (m->>'actor_id')::uuid
      else null
    end;

    v_id := null;
    insert into public.stock_movements
      (business_id, branch_id, item_id, qty_base, unit_cost, source_type,
       source_id, source_line, occurred_at, actor_id, actor_name, reason,
       reversal_of)
    values (
      v_business,
      nullif(m->>'branch_id','')::uuid,
      v_item,
      v_qty,
      nullif(m->>'unit_cost','')::numeric,
      coalesce(nullif(m->>'source_type',''),'adjustment'),
      nullif(m->>'source_id',''),
      coalesce(nullif(m->>'source_line','')::integer,0),
      coalesce(nullif(m->>'occurred_at','')::timestamptz,now()),
      v_actor,
      nullif(m->>'actor_name',''),
      nullif(m->>'reason',''),
      nullif(m->>'reversal_of','')::uuid
    )
    on conflict (source_type, source_id, item_id, source_line) do nothing
    returning id into v_id;

    if v_id is null then
      select stock into v_stock from public.items where id = v_item;
      v_results := v_results || jsonb_build_object(
        'item_id',v_item,'duplicate',true,'new_stock',v_stock);
      continue;
    end if;

    if p_apply then
      update public.items set stock = coalesce(stock,0) + v_qty, updated_at = now()
        where id = v_item returning stock into v_stock;
    else
      select stock into v_stock from public.items where id = v_item;
    end if;
    v_results := v_results || jsonb_build_object(
      'item_id',v_item,'movement_id',v_id,'new_stock',v_stock);
  end loop;
  return jsonb_build_object('movements',v_results);
end;
$$;

grant execute on function public.post_stock_movements(jsonb, boolean) to authenticated;
notify pgrst, 'reload schema';
