alter table public.shop_settings
  add column if not exists expense_categories text[] not null default '{}'::text[];

notify pgrst, 'reload schema';
