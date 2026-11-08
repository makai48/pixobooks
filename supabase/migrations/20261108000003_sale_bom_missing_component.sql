-- Tolerate dangling BOM references at checkout.
--
-- `build_sale_movements_authoritative` issued stock for every BOM component of
-- a sold product and raised `23514 Sale BOM contains a missing component` when
-- a component row no longer existed. That aborts the whole sale, even though a
-- missing component has no stock row left to decrement (usually the result of
-- a wipe, a partial import, or components imported from another database).
--
-- Two changes:
--   1. clean the stored BOMs once, dropping lines that point at deleted items;
--   2. make the movement builder skip (and warn about) any dangling line
--      instead of failing the checkout, and scope components to the sale's
--      business.
--
-- Idempotent: safe to re-run.

-- 1. Repair stored BOMs that reference items which no longer exist.
update public.items i
set bom = coalesce((
    select jsonb_agg(b)
    from jsonb_array_elements(i.bom) b
    where exists (
      select 1 from public.items m
      where m.id = nullif(coalesce(b->>'materialId', b->>'material_id'), '')::uuid
    )
  ), '[]'::jsonb),
  updated_at = now()
where jsonb_array_length(coalesce(i.bom, '[]'::jsonb)) > 0
  and exists (
    select 1
    from jsonb_array_elements(i.bom) b
    where not exists (
      select 1 from public.items m
      where m.id = nullif(coalesce(b->>'materialId', b->>'material_id'), '')::uuid
    )
  );

-- 2. Movement builder: never fail a sale because a component disappeared.
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
        select * into mat from public.items
          where id = nullif(coalesce(b->>'materialId',b->>'material_id'),'')::uuid
            and (p_business is null or business_id = p_business);
        if not found then
          -- Nothing left to decrement: skip the stale recipe line, keep the sale.
          raise warning 'Skipping missing BOM component % on item %',
            coalesce(b->>'materialId', b->>'material_id'), item.id;
          continue;
        end if;
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
grant execute on function public.build_sale_movements_authoritative(jsonb,uuid,uuid,text,text) to authenticated;
notify pgrst, 'reload schema';
