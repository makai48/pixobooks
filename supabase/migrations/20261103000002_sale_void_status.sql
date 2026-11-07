-- Phase 3: void is a reversal document, not a deletion.
--
-- Deleting a sale erased the counter-document: stock evidence, payments,
-- loyalty and credit linkage all disappeared with it. These columns keep the
-- original document visible and immutable while marking it voided; revenue
-- reports, the cash ledger and stock flows exclude it, and the reversal is
-- recorded in stock_movements (source_type = 'sale_void').
--
-- Safe to re-run.

alter table public.sales
  add column if not exists voided_at timestamptz,
  add column if not exists voided_by text,
  add column if not exists voided_by_name text,
  add column if not exists void_reason text;

create index if not exists sales_voided_idx
  on public.sales (business_id, voided_at)
  where voided_at is not null;

notify pgrst, 'reload schema';
