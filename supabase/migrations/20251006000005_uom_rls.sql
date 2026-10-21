-- UOM master RLS: allow authenticated app users full access to the
-- UOM master tables (same open-shop model as the rest of PixoBooks).
-- Without these, every unit/category save fails with:
--   "new row violates row-level security policy"
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
-- Safe to re-run.

alter table public.uoms enable row level security;
alter table public.uom_categories enable row level security;

drop policy if exists "uoms_authenticated_all" on public.uoms;
create policy "uoms_authenticated_all"
  on public.uoms for all
  to authenticated
  using (true)
  with check (true);

drop policy if exists "uom_categories_authenticated_all" on public.uom_categories;
create policy "uom_categories_authenticated_all"
  on public.uom_categories for all
  to authenticated
  using (true)
  with check (true);
