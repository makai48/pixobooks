-- SaaS billing columns for shop_settings (single-shop `id='main'` model).
-- Run: supabase db push
alter table public.shop_settings
  add column if not exists plan text not null default 'starter'
    check (plan in ('starter','growth','pro')),
  add column if not exists subscription_status text not null default 'trialing'
    check (subscription_status in ('trialing','active','past_due','canceled','incomplete')),
  add column if not exists trial_ends_at timestamptz null,
  add column if not exists current_period_end timestamptz null,
  add column if not exists stripe_customer_id text null,
  add column if not exists stripe_subscription_id text null;

-- Backfill trial for existing shops (14 days from now if null)
update public.shop_settings
set trial_ends_at = now() + interval '14 days'
where trial_ends_at is null and subscription_status = 'trialing';

create index if not exists shop_settings_stripe_sub_idx
  on public.shop_settings (stripe_subscription_id);
