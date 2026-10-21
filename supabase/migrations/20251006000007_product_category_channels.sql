-- Product category + channel visibility (Odoo-style Goods/Services/Kits
-- plus Purchase / Sale / Point-of-Sale ticks).
-- product_category: 'goods' | 'service' | 'kit' (default 'goods').
-- can_purchase / can_sell / pos_visible: NULL or true = visible (legacy
-- rows stay visible everywhere); false hides the item from that channel.
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
alter table public.items
  add column if not exists product_category text not null default 'goods'
    check (product_category in ('goods', 'service', 'kit')),
  add column if not exists can_purchase boolean null,
  add column if not exists can_sell boolean null,
  add column if not exists pos_visible boolean null;
