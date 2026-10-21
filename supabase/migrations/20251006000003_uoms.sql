-- Centralized UOM architecture (PixoBooks UOM upgrade).
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT guards throughout).

-- 1. UOM master -----------------------------------------------------------
create table if not exists public.uoms (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text null,
  -- Discrete (whole-number only: Sheet, Piece, Box, Ream, Bottle, Item)
  -- vs divisible (Kg, g, L, ml, Metres). Controls what quantities may be
  -- transacted; mathematical conversion may still yield fractions for
  -- analysis but the transaction engine rejects fractional discrete qtys.
  discrete boolean not null default true,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 2. Canonical seed (discrete vs divisible per spec) -----------------------
insert into public.uoms (code, name, symbol, discrete) values
  ('ream', 'Ream', null, true),
  ('sheet', 'Sheet', null, true),
  ('page', 'Page', null, true),
  ('pc', 'Piece', 'pc', true),
  ('box', 'Box', null, true),
  ('bottle', 'Bottle', null, true),
  ('item', 'Item', null, true),
  ('kg', 'Kilogram', 'kg', false),
  ('g', 'Gram', 'g', false),
  ('l', 'Litre', 'L', false),
  ('ml', 'Millilitre', 'ml', false),
  ('metre', 'Metre', 'm', false)
on conflict (code) do nothing;

-- 3. Backfill master from existing data (codes already in use) ------------
insert into public.uoms (code, name, discrete)
select distinct lower(trim(u)), initcap(trim(u)), true
from (
  select from_unit as u from public.unit_conversions
  union
  select to_unit as u from public.unit_conversions
  union
  select base_unit as u from public.items where base_unit is not null
  union
  select purchase_unit as u from public.items where purchase_unit is not null
  union
  select sale_unit as u from public.items where sale_unit is not null
) s
where trim(u) <> ''
on conflict (code) do nothing;

-- 4. Conversion table: FKs + integrity ------------------------------------
alter table public.unit_conversions
  add column if not exists from_uom_id uuid references public.uoms(id),
  add column if not exists to_uom_id uuid references public.uoms(id);

update public.unit_conversions uc
set from_uom_id = u.id
from public.uoms u
where uc.from_uom_id is null and lower(u.code) = lower(uc.from_unit);

update public.unit_conversions uc
set to_uom_id = u.id
from public.uoms u
where uc.to_uom_id is null and lower(u.code) = lower(uc.to_unit);

-- One fundamental relationship stored once (directed).
drop index if exists unit_conversions_pair_uidx;
create unique index if not exists unit_conversions_pair_uidx
  on public.unit_conversions (lower(from_unit), lower(to_unit));

-- Integrity: positive factors, no self-conversion.
do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'unit_conversions_factor_chk'
  ) then
    alter table public.unit_conversions
      add constraint unit_conversions_factor_chk check (factor > 0);
  end if;
  if not exists (
    select 1 from pg_constraint where conname = 'unit_conversions_noself_chk'
  ) then
    alter table public.unit_conversions
      add constraint unit_conversions_noself_chk check (lower(from_unit) <> lower(to_unit));
  end if;
end $$;

-- 5. Items: authoritative UOM references -----------------------------------
alter table public.items
  add column if not exists purchase_uom_id uuid references public.uoms(id),
  add column if not exists sale_uom_id uuid references public.uoms(id),
  add column if not exists base_uom_id uuid references public.uoms(id);

update public.items i
set purchase_uom_id = u.id
from public.uoms u
where i.purchase_uom_id is null and i.purchase_unit is not null
  and lower(u.code) = lower(i.purchase_unit);

update public.items i
set sale_uom_id = u.id
from public.uoms u
where i.sale_uom_id is null and i.sale_unit is not null
  and lower(u.code) = lower(i.sale_unit);

update public.items i
set base_uom_id = u.id
from public.uoms u
where i.base_uom_id is null and i.base_unit is not null
  and lower(u.code) = lower(i.base_unit);
