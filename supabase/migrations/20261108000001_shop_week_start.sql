-- Business week start preference.
--
-- Drives "This Week" and "Last Week" in the Sales Report and Statistics.
-- Monday is the default for every workspace; an admin may change it in
-- Settings → Business Profile → Week Starts On.

alter table public.shop_settings
  add column if not exists week_start text not null default 'monday'
  check (
    week_start in (
      'sunday', 'monday', 'tuesday', 'wednesday',
      'thursday', 'friday', 'saturday'
    )
  );

-- Backfill any rows created before the constraint existed.
update public.shop_settings
set week_start = 'monday'
where week_start is null
   or week_start not in (
     'sunday', 'monday', 'tuesday', 'wednesday',
     'thursday', 'friday', 'saturday'
   );
