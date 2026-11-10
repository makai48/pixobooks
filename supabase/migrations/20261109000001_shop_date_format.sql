alter table public.shop_settings
  add column if not exists date_format text not null default 'DD/MM/YYYY';

alter table public.shop_settings
  drop constraint if exists shop_settings_date_format_check;

alter table public.shop_settings
  add constraint shop_settings_date_format_check
  check (date_format in ('DD/MM/YYYY', 'DD MMM YYYY', 'DD MMMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD'));

update public.shop_settings
set date_format = 'DD/MM/YYYY'
where date_format is null
   or date_format not in ('DD/MM/YYYY', 'DD MMM YYYY', 'DD MMMM YYYY', 'MM/DD/YYYY', 'YYYY-MM-DD');
