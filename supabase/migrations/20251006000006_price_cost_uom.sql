-- Price/cost UOM presentation (Odoo-style "per Units" selectors).
-- price_uom: unit the stored item.price applies to (defaults to sale unit).
-- cost_uom: unit the stored item.cost applies to (defaults to base unit).
-- Plain text codes (display semantics); canonical money math always
-- converts into per-saleUOM price and per-base cost on save.
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
alter table public.items
  add column if not exists price_uom text null,
  add column if not exists cost_uom text null;

update public.items
set price_uom = coalesce(sale_unit, base_unit, 'pc')
where price_uom is null;

update public.items
set cost_uom = coalesce(base_unit, 'pc')
where cost_uom is null;
