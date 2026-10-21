-- Odoo-inspired UOM families: categories, reference UOMs, ratios, precision.
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
-- Safe to re-run (IF NOT EXISTS / ON CONFLICT guards throughout).

-- 1. Categories (families). Units convert ONLY within a category. ---------
create table if not exists public.uom_categories (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  reference_uom_id uuid references public.uoms(id),
  description text null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Seed families from the legacy category vocabulary + print default.
insert into public.uom_categories (name, description) values
  ('paper', 'Printing quantity: Page, Sheet, Ream'),
  ('weight', 'Weight: g, kg, tonne'),
  ('volume', 'Volume: ml, litre'),
  ('length', 'Length: mm, cm, metre'),
  ('area', 'Area'),
  ('ink', 'Ink & consumables'),
  ('general', 'General count: Piece, Dozen, Box')
on conflict (name) do nothing;

-- 2. Extend the master -----------------------------------------------------
alter table public.uoms
  add column if not exists category_id uuid references public.uom_categories(id),
  add column if not exists ratio numeric null,
  add column if not exists rounding numeric not null default 1;

-- Reference UOM per family (the mathematical anchor; ratio = 1 there).
-- Reference rows themselves get ratio = 1 below via the BFS seed.
do $$
declare
  _refs text[][] := array[
    ['paper', 'sheet'], ['weight', 'kg'], ['volume', 'l'],
    ['length', 'metre'], ['area', 'metre'], ['ink', 'ml'],
    ['general', 'pc']
  ];
  _pair text[];
begin
  foreach _pair slice 1 in array _refs loop
    update public.uom_categories c
    set reference_uom_id = u.id, updated_at = now()
    from public.uoms u
    where c.name = _pair[1] and lower(u.code) = _pair[2]
      and c.reference_uom_id is null;
  end loop;
end $$;

-- Attach each unit to the first family that mentions it in conversions.
update public.uoms u
set category_id = first_cat.cat_id
from (
  select distinct on (lower(trim(x.u))) trim(x.u) as code, c.id as cat_id
  from (
    select from_unit as u, category as cat from public.unit_conversions
    union all
    select to_unit as u, category as cat from public.unit_conversions
  ) x
  join public.uom_categories c on c.name = x.cat
  order by lower(trim(x.u)), x.cat
) first_cat
where u.category_id is null and lower(u.code) = lower(first_cat.code);

-- Default precision: discrete units stay whole (1); divisible families get
-- sensible increments (editable per unit in the master UI).
update public.uoms
set rounding = case
  when not discrete then case lower(code)
    when 'kg' then 0.001
    when 'metre' then 0.01
    else 0.001
  end
  else 1
end
where rounding = 1 and not discrete;

-- 3. Backfill reference ratios (recursive walk from each reference) --------
-- ratio = reference-units per 1 unit (Sheet=1, Ream=500, Page=0.5).
-- Only same-category conversion rows are traversed: cross-family links
-- can never leak into a ratio. Unreachable units keep ratio NULL and the
-- engine falls back to pair-graph math for them.
with recursive walk(cat_id, code, ratio, depth) as (
  select c.id, u.code, 1::numeric, 0
  from public.uom_categories c
  join public.uoms u on u.id = c.reference_uom_id
  union
  -- ratio[X] = reference units per 1 X. Row "1 from = factor to":
  -- neighbor to-unit  => ratio = w.ratio / factor;
  -- neighbor from-unit => ratio = w.ratio * factor.
  select
    w.cat_id,
    case
      when lower(uc.from_unit) = lower(w.code) then lower(uc.to_unit)
      else lower(uc.from_unit)
    end,
    case
      when lower(uc.from_unit) = lower(w.code) then w.ratio / nullif(uc.factor, 0)
      else w.ratio * uc.factor
    end,
    w.depth + 1
  from walk w
  join public.unit_conversions uc
    on uc.category = (select name from public.uom_categories where id = w.cat_id)
   and (lower(uc.from_unit) = lower(w.code) or lower(uc.to_unit) = lower(w.code))
  where w.depth < 25
)
update public.uoms u
set ratio = w.ratio
from (select distinct on (code) code, ratio from walk order by code, depth) w
where lower(u.code) = w.code and u.ratio is null;
