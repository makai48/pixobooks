-- Transaction-count allowance policy (per-employee sales threshold that
-- auto-considers a daily-style allowance, optionally awaiting approval).
-- Both columns are plain jsonb blobs owned by the settings screens; the
-- app mapper falls back to defaults when they are absent, so this is safe
-- to apply on older deployments. Run in Supabase Dashboard -> SQL Editor.
alter table public.shop_settings
  add column if not exists transaction_allowance_policy jsonb not null default '{}'::jsonb,
  add column if not exists pending_txn_allowances jsonb not null default '[]'::jsonb;

notify pgrst, 'reload schema';
