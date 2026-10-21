-- Monthly client invoice generation: pg_cron + pg_net -> edge function.
--
-- The job ticks hourly (server/UTC) and the trigger function decides whether it
-- is midnight on the 1st in the shop's configured timezone. When it is, it calls
--   POST /functions/v1/generate-monthly-invoices   {"mode":"auto","period":"YYYY-MM"}
-- which invoices the period that just ended for every client whose
-- invoice_generation_mode is 'automatic'.
--
-- Timezone source: public.shop_settings.timezone for the single row id = 'main'
-- (Settings -> Operating Time Zone), falling back to 'UTC'. pg_cron cannot apply
-- a per-job timezone, so the schedule stays UTC and the guard reads the setting
-- on every tick; changing the timezone in the app needs no re-migration.
--
-- Whole-hour UTC offsets fire at exactly local 00:00. Half/quarter-hour offsets
-- (e.g. +05:30, +05:45) fire at :30/:45 because the tick is hourly; the edge
-- function is idempotent, so a delayed tick is safe.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run, after
-- 20251006000008_client_billing.sql.
--
-- Prerequisites (set these once, from the SQL editor):
--   select vault.create_secret('https://<project-ref>.supabase.co', 'pixo_project_url');
--   select vault.create_secret('<service-role-key>', 'pixo_service_role_key');
--
-- Then deploy the function:
--   supabase functions deploy generate-monthly-invoices
--
-- Safe to re-run: the extension setup is idempotent, the function is replaced,
-- and the existing job with the same name is unscheduled before re-adding.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- ---------------------------------------------------------------------------
-- Trigger function
-- ---------------------------------------------------------------------------

create or replace function public.client_billing_trigger_monthly_invoices()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $fn$
declare
  v_tz text := 'UTC';
  v_local timestamp;
  v_period text;
  v_url text;
  v_key text;
  v_request_id bigint;
begin
  -- Read the shop timezone defensively: the table/column may be absent in a
  -- fresh database, and a bad stored value must not break the job.
  if to_regclass('public.shop_settings') is not null then
    begin
      execute
        'select timezone from public.shop_settings where id = ''main'' limit 1'
        into v_tz;
    exception when others then
      v_tz := null;
    end;
  end if;

  v_tz := coalesce(nullif(btrim(v_tz), ''), 'UTC');

  begin
    v_local := now() at time zone v_tz;
  exception when others then
    v_local := now() at time zone 'UTC';
  end;

  -- Only fire during the first hour of the 1st in local time.
  if extract(day from v_local) <> 1 or extract(hour from v_local) <> 0 then
    return null;
  end if;

  -- The edge function defaults to "previous month in UTC", which is the wrong
  -- month for shops ahead of UTC at local midnight. Pass the local period.
  v_period := to_char(v_local::date - 1, 'YYYY-MM');

  select decrypted_secret into v_url
  from vault.decrypted_secrets
  where name = 'pixo_project_url'
  limit 1;

  select decrypted_secret into v_key
  from vault.decrypted_secrets
  where name = 'pixo_service_role_key'
  limit 1;

  if v_url is null or v_key is null then
    raise exception
      'Missing vault secrets: create pixo_project_url and pixo_service_role_key';
  end if;

  select net.http_post(
    url := rtrim(v_url, '/') || '/functions/v1/generate-monthly-invoices',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'auto', 'period', v_period),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$fn$;

revoke all on function public.client_billing_trigger_monthly_invoices() from public;
grant execute on function public.client_billing_trigger_monthly_invoices()
  to postgres, service_role;

-- ---------------------------------------------------------------------------
-- Schedule: hourly tick, guarded to local 00:00 on the 1st
-- ---------------------------------------------------------------------------

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'client-billing-monthly') then
    perform cron.unschedule('client-billing-monthly');
  end if;

  perform cron.schedule(
    'client-billing-monthly',
    '0 * * * *',
    $job$select public.client_billing_trigger_monthly_invoices();$job$
  );
end
$cron$;

-- Inspect later:
--   select jobid, jobname, schedule, active from cron.job;
--   select * from cron.job_run_details order by start_time desc limit 20;
--   select * from net._http_response order by created desc limit 20;
