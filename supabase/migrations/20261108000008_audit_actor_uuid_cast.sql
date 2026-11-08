-- Definitive audit-trigger fix for voids.
--
-- The previous fixes focused on stock_movements.actor_id. The failing
-- expression during a void is actually raised by the AFTER UPDATE trigger on
-- sales: sales.voided_by is a legacy TEXT column, while audit_logs.actor_id is
-- UUID. The trigger passed new.voided_by directly, so the sales update failed
-- before the void writer could run.
--
-- Cast the legacy text safely in the trigger. Invalid historical actor values
-- become NULL; the audit still retains actor_name and the sale remains
-- voidable. The adjustment trigger is corrected at the same time because it
-- has the identical created_by text -> actor_id uuid risk.

create or replace function public.audit_sale_void_transaction()
returns trigger language plpgsql security definer set search_path = public
as $$
declare v_actor uuid;
begin
  if old.voided_at is null and new.voided_at is not null then
    v_actor := case
      when nullif(btrim(new.voided_by), '') is null then null
      when btrim(new.voided_by) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
        then new.voided_by::uuid
      else null
    end;
    insert into public.audit_logs
      (business_id, actor_id, actor_name, action, entity, entity_id, meta)
    values
      (new.business_id, v_actor, new.voided_by_name, 'sale.void', 'sale', new.id,
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
declare v_actor uuid;
begin
  v_actor := case
    when nullif(btrim(new.created_by), '') is null then null
    when btrim(new.created_by) ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
      then new.created_by::uuid
    else null
  end;
  insert into public.audit_logs
    (business_id, actor_id, actor_name, action, entity, entity_id, meta)
  values
    (new.business_id, v_actor, new.created_by_name, 'stock.adjust', 'item', new.item_id,
     jsonb_build_object('adjustment_id',new.id,'delta',new.qty_change,
       'old',new.old_stock,'new',new.new_stock,'reason',new.reason));
  return new;
end;
$$;

drop trigger if exists audit_adjustment_transaction on public.stock_adjustments;
create trigger audit_adjustment_transaction
after insert on public.stock_adjustments
for each row execute function public.audit_adjustment_transaction();

notify pgrst, 'reload schema';
