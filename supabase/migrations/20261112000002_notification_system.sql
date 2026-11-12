-- ============================================================================
-- Notification system — catalog, delivery gate, inbox, preferences, push.
--
-- Design:
--   notification_kinds      global catalog of every notification the shop can
--                            raise (kind, label, category, severity).
--   notification_policies   PER-BUSINESS delivery gate: who receives what.
--                            This is the "permission gate" — one row per
--                            (business, kind) holding the minimum role and the
--                            permission that unlocks the notification.
--   notifications           one row per recipient (not per event). A row
--                            exists only for a user the gate selected, so RLS
--                            is a simple `user_id = auth.uid()` and nobody can
--                            read another person's inbox.
--   notification_preferences per-user, per-kind channel switches.
--   push_subscriptions      Web Push endpoints for mobile / desktop.
--
-- Rules live in `evaluate_notification_rules()` so the SAME logic runs from
-- the open app (instant) and from pg_cron (background, app closed). The
-- client never decides who receives a notification — `create_notification()`
-- resolves recipients from the gate.
-- ============================================================================

-- 1. Catalog ----------------------------------------------------------------

create table if not exists public.notification_kinds (
  kind text primary key,
  label text not null,
  category text not null default 'General',
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'critical')),
  description text not null default '',
  -- Default gate for a new business. A business may override every one of
  -- these in `notification_policies`.
  min_role text not null default 'staff'
    check (min_role in ('owner', 'admin', 'manager', 'staff')),
  required_permission text null,
  allow_in_app boolean not null default true,
  allow_push boolean not null default true,
  quiet_hours_exempt boolean not null default false,
  sort_order integer not null default 100,
  enabled boolean not null default true,
  updated_at timestamptz not null default now()
);

comment on table public.notification_kinds is
  'Global catalog of notification kinds and their default delivery gate.';

insert into public.notification_kinds (
  kind, label, category, severity, description,
  min_role, required_permission, allow_in_app, allow_push,
  quiet_hours_exempt, sort_order
) values
  ('stock.low',               'Low stock',                   'Inventory',   'warning',  'Products at or below their reorder level.',                 'manager', 'inventory.edit',        true, true, false, 10),
  ('stock.take.due',          'Stock take due',              'Inventory',   'info',     'The shop has not counted stock for a week.',                     'manager', 'inventory.adjust',      true, true, false, 20),
  ('po.progress',             'Purchase order progress',     'Purchasing',  'info',     'Orders placed and still waiting for delivery.',                   'staff',   'po.view',              true, true, false, 30),
  ('po.overdue',              'Purchase order overdue',      'Purchasing',  'critical', 'A purchase order passed its expected delivery date.',            'manager', 'po.manage',            true, true, true,  40),
  ('po.draft.stale',          'Draft order forgotten',       'Purchasing',  'info',     'A purchase order has been left in draft.',                        'manager', 'po.manage',            true, true, false, 50),
  ('sales.peak.month',        'Monthly peak sales',          'Performance', 'success',  'This month is the best trading month so far.',                  'owner',   'stats.view',           true, true, false, 60),
  ('sales.top.customer',      'Top customer this month',     'Performance', 'success',  'The customer bringing in the most revenue this month.',         'manager', 'customers.view',        true, true, false, 70),
  ('closing.due',             'Daily closing due',           'Finance',     'warning',  'The till has not been balanced for today.',                       'manager', 'finance.cashbook.view', true, true, false, 80),
  ('closing.variance',        'Closing variance',            'Finance',     'critical', 'The counted cash does not match the ledger.',                     'manager', 'finance.cashbook.view', true, true, true,  90),
  ('drawings.exceed.expenses','Drawings exceed expenses',    'Finance',     'critical', 'Money drawn out is more than the shop has spent.',                'owner',   'finance.manage',       true, true, true,  100),
  ('client.invoice.overdue',  'Client invoice overdue',      'Finance',     'warning',  'Client invoices are past their due date.',                        'manager', 'finance.view',          true, true, false, 110),
  ('quote.stale',             'Quote awaiting a decision',   'Sales',       'info',     'A quote has been waiting for an answer.',                          'staff',   'quotes.view',           true, true, false, 120),
  ('staff.approval.pending',  'Approval waiting',            'Team',        'info',     'An account is waiting for approval.',                             'manager', 'employees.manage',      true, true, false, 130),
  ('attendance.missing',      'Attendance not marked',       'Team',        'info',     'Team members have no attendance record today.',                    'manager', 'employees.attendance',  true, true, false, 140)
on conflict (kind) do update set
  label = excluded.label,
  category = excluded.category,
  severity = excluded.severity,
  description = excluded.description,
  min_role = excluded.min_role,
  required_permission = excluded.required_permission,
  allow_in_app = excluded.allow_in_app,
  allow_push = excluded.allow_push,
  quiet_hours_exempt = excluded.quiet_hours_exempt,
  sort_order = excluded.sort_order,
  updated_at = now();

-- 2. Per-business delivery gate ---------------------------------------------

create table if not exists public.notification_policies (
  business_id uuid not null references public.businesses (id) on delete cascade,
  kind text not null references public.notification_kinds (kind) on delete cascade,
  -- Minimum role that receives this notification. `required_permission` is an
  -- OR-escape hatch: holding it grants the notification at any role.
  min_role text not null default 'staff'
    check (min_role in ('owner', 'admin', 'manager', 'staff')),
  required_permission text null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  quiet_hours_exempt boolean not null default false,
  enabled boolean not null default true,
  updated_at timestamptz not null default now(),
  primary key (business_id, kind)
);

comment on table public.notification_policies is
  'Per-business delivery gate: which roles / permissions receive which notification.';

create table if not exists public.notification_settings (
  business_id uuid primary key references public.businesses (id) on delete cascade,
  quiet_hours_enabled boolean not null default true,
  quiet_start time not null default '20:00',
  quiet_end time not null default '06:00',
  closing_reminder_time time not null default '19:00',
  digest_hour integer not null default 7,
  updated_at timestamptz not null default now()
);

-- 3. Inbox ------------------------------------------------------------------

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  severity text not null default 'info'
    check (severity in ('info', 'success', 'warning', 'critical')),
  title text not null,
  body text not null default '',
  link text null,
  meta jsonb not null default '{}'::jsonb,
  -- One row per recipient per event. The key encodes the event bucket
  -- (date / month / entity), so the same alert never repeats in that bucket.
  dedupe_key text not null,
  source text not null default 'system',
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  dismissed_at timestamptz null,
  delivered_at timestamptz null,
  constraint notifications_dedupe_unique unique (business_id, user_id, dedupe_key)
);

create index if not exists notifications_inbox_idx
  on public.notifications (user_id, business_id, created_at desc);
create index if not exists notifications_unread_idx
  on public.notifications (user_id, created_at desc)
  where read_at is null and dismissed_at is null;

create table if not exists public.notification_preferences (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  kind text not null,
  in_app_enabled boolean not null default true,
  push_enabled boolean not null default true,
  quiet_hours_exempt boolean null,
  updated_at timestamptz not null default now(),
  constraint notification_preferences_unique unique (business_id, user_id, kind)
);

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  business_id uuid not null references public.businesses (id) on delete cascade,
  user_id uuid not null references auth.users (id) on delete cascade,
  endpoint text not null,
  p256dh text not null,
  auth text not null,
  user_agent text null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint push_subscriptions_unique unique (business_id, user_id, endpoint)
);

-- 4. Helpers ----------------------------------------------------------------

create or replace function public.notification_role_rank(p_role text)
returns integer
language sql
immutable
as $$
  select case lower(trim(coalesce(p_role, '')))
    when 'owner' then 4
    when 'admin' then 3
    when 'manager' then 2
    when 'staff' then 1
    else 0
  end;
$$;

/**
 * Normalise `user_profiles.permissions` into a text[].
 * The column has been stored as `text[]` and as `jsonb` by different builds,
 * so both shapes are accepted. Anything unparseable yields an empty list
 * rather than raising — a broken permission array must never block a login.
 */
create or replace function public.profile_permission_list(p_user uuid)
returns text[]
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  raw jsonb;
  out text[] := '{}';
begin
  if p_user is null then
    return '{}';
  end if;

  begin
    select to_jsonb(up.permissions) into raw
      from public.user_profiles up
     where up.id = p_user;
  exception when others then
    raw := null;
  end;

  if raw is null then
    return '{}';
  end if;

  -- Some builds wrote the array as a JSON *string* holding JSON.
  if jsonb_typeof(raw) = 'string' then
    begin
      raw := (raw #>> '{}')::jsonb;
    exception when others then
      raw := null;
    end;
  end if;

  if jsonb_typeof(raw) = 'array' then
    select coalesce(array_agg(v #>> '{}'), '{}')
      into out
      from jsonb_array_elements(raw) v;
  end if;

  return coalesce(out, '{}');
end;
$$;

/**
 * Resolve the recipients of one notification kind for one business.
 *
 * This is the gate. A person is a recipient when their tier reaches the
 * policy's minimum role OR they hold the policy's permission key, AND at
 * least one channel (in-app / push) is switched on for them.
 */
create or replace function public.notification_recipients_for(
  p_business_id uuid,
  p_kind text
)
returns table (user_id uuid)
language sql
stable
security definer
set search_path = public
as $$
  with policy as (
    select * from public.notification_policies
     where business_id = p_business_id and kind = p_kind
  ),
  members as (
    select
      bm.user_id,
      greatest(
        public.notification_role_rank(bm.role),
        public.notification_role_rank(up.role)
      ) as tier,
      coalesce(up.active, true) as is_active
    from public.business_members bm
    join public.user_profiles up on up.id = bm.user_id
    where bm.business_id = p_business_id
  )
  select m.user_id
  from members m
  join policy pol on true
  left join public.notification_preferences pref
    on pref.business_id = p_business_id
   and pref.user_id = m.user_id
   and pref.kind = p_kind
  where m.is_active
    and pol.enabled
    and (
      m.tier >= public.notification_role_rank(pol.min_role)
      or (
        pol.required_permission is not null
        and public.profile_permission_list(m.user_id)
            @> array[pol.required_permission]
      )
    )
    and (
      (pol.in_app_enabled and coalesce(pref.in_app_enabled, true))
      or (pol.push_enabled and coalesce(pref.push_enabled, true))
    );
$$;

/**
 * Raise one notification for a business.
 *
 * The caller cannot choose recipients: they are resolved from the delivery
 * gate. A non-privileged caller may only raise kinds it is itself entitled
 * to, so a staff member can never spam a manager. The service role (cron /
 * edge function) and the rule engine may raise anything.
 */
create or replace function public.create_notification(
  p_business_id uuid,
  p_kind text,
  p_title text,
  p_body text default '',
  p_link text default null,
  p_meta jsonb default '{}'::jsonb,
  p_dedupe_key text default null,
  p_severity text default null,
  p_source text default 'system'
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller uuid := auth.uid();
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_engine boolean := coalesce(current_setting('pixo.notification_engine', true), '') = '1';
  v_kind_row public.notification_kinds%rowtype;
  v_policy public.notification_policies%rowtype;
  v_severity text;
  v_key text;
  v_inserted integer := 0;
  v_mine integer := 0;
begin
  if not v_service and not v_engine then
    if v_caller is null then
      raise exception 'Not authenticated';
    end if;
    if not public.is_member(p_business_id) then
      raise exception 'Not a member of this workspace';
    end if;
  end if;

  if p_business_id is null then
    raise exception 'A business is required';
  end if;

  select * into v_kind_row
    from public.notification_kinds
   where kind = p_kind;
  if not found then
    raise exception 'Unknown notification kind: %', p_kind;
  end if;
  if not v_kind_row.enabled then
    return jsonb_build_object('created', 0, 'kind', p_kind, 'reason', 'disabled');
  end if;

  select * into v_policy
    from public.notification_policies
   where business_id = p_business_id and kind = p_kind;
  if not found then
    return jsonb_build_object('created', 0, 'kind', p_kind, 'reason', 'no_policy');
  end if;
  if not v_policy.enabled then
    return jsonb_build_object('created', 0, 'kind', p_kind, 'reason', 'policy_off');
  end if;

  v_severity := coalesce(p_severity, v_kind_row.severity);
  v_key := coalesce(nullif(trim(p_dedupe_key), ''), p_kind);

  if not v_service and not v_engine and not public.is_privileged(p_business_id) then
    if not exists (
      select 1
        from public.notification_recipients_for(p_business_id, p_kind) r
       where r.user_id = v_caller
    ) then
      raise exception 'Your role cannot raise % notifications', p_kind;
    end if;
  end if;

  insert into public.notifications (
    business_id, user_id, kind, severity, title, body,
    link, meta, dedupe_key, source
  )
  select
    p_business_id, r.user_id, p_kind, v_severity, p_title,
    coalesce(p_body, ''), p_link, coalesce(p_meta, '{}'::jsonb), v_key, p_source
  from public.notification_recipients_for(p_business_id, p_kind) r
  on conflict (business_id, user_id, dedupe_key) do nothing;

  get diagnostics v_inserted = row_count;

  select count(*) into v_mine
    from public.notifications
   where business_id = p_business_id
     and user_id = v_caller
     and dedupe_key = v_key
     and read_at is null
     and dismissed_at is null;

  return jsonb_build_object(
    'created', v_inserted,
    'kind', p_kind,
    'dedupe_key', v_key,
    'mine', v_mine
  );
end;
$$;

-- 5. Policy seeding ---------------------------------------------------------

insert into public.notification_policies (
  business_id, kind, min_role, required_permission,
  in_app_enabled, push_enabled, quiet_hours_exempt, enabled
)
select
  b.id, k.kind, k.min_role, k.required_permission,
  k.allow_in_app, k.allow_push, k.quiet_hours_exempt, k.enabled
from public.businesses b
cross join public.notification_kinds k
on conflict (business_id, kind) do nothing;

insert into public.notification_settings (business_id)
select id from public.businesses
on conflict (business_id) do nothing;

create or replace function public.seed_notification_policies(p_business_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notification_policies (
    business_id, kind, min_role, required_permission,
    in_app_enabled, push_enabled, quiet_hours_exempt, enabled
  )
  select
    p_business_id, k.kind, k.min_role, k.required_permission,
    k.allow_in_app, k.allow_push, k.quiet_hours_exempt, k.enabled
  from public.notification_kinds k
  on conflict (business_id, kind) do nothing;

  insert into public.notification_settings (business_id)
  values (p_business_id)
  on conflict (business_id) do nothing;
end;
$$;

-- The trigger wrapper. A trigger function may NOT take arguments in the
-- EXECUTE FUNCTION clause — the row arrives through TG_NEW. Passing
-- `new.id` there is a syntax error (42601).
create or replace function public.on_business_created_notification_policies()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  perform public.seed_notification_policies(new.id);
  return new;
end;
$$;

drop trigger if exists on_business_created_notification_policies on public.businesses;
create trigger on_business_created_notification_policies
  after insert on public.businesses
  for each row execute function public.on_business_created_notification_policies();

-- 6. Row level security -----------------------------------------------------

alter table public.notification_kinds enable row level security;
alter table public.notification_policies enable row level security;
alter table public.notification_settings enable row level security;
alter table public.notifications enable row level security;
alter table public.notification_preferences enable row level security;
alter table public.push_subscriptions enable row level security;

do $$
declare
  pol record;
begin
  -- notification_kinds: read-only catalog for signed-in users.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notification_kinds'
  loop
    execute format('drop policy %I on public.notification_kinds', pol.policyname);
  end loop;
  execute 'create policy "notification_kinds_read" '
    || 'on public.notification_kinds for select to authenticated using (true)';

  -- notification_policies: members read the gate, owners/managers/admins write it.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notification_policies'
  loop
    execute format('drop policy %I on public.notification_policies', pol.policyname);
  end loop;
  execute 'create policy "notification_policies_member_read" '
    || 'on public.notification_policies for select to authenticated '
    || 'using (public.is_member(business_id))';
  execute 'create policy "notification_policies_privileged_write" '
    || 'on public.notification_policies for all to authenticated '
    || 'using (public.is_privileged(business_id)) '
    || 'with check (public.is_privileged(business_id))';

  -- notification_settings: same shape as the gate.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notification_settings'
  loop
    execute format('drop policy %I on public.notification_settings', pol.policyname);
  end loop;
  execute 'create policy "notification_settings_member_read" '
    || 'on public.notification_settings for select to authenticated '
    || 'using (public.is_member(business_id))';
  execute 'create policy "notification_settings_privileged_write" '
    || 'on public.notification_settings for all to authenticated '
    || 'using (public.is_privileged(business_id)) '
    || 'with check (public.is_privileged(business_id))';

  -- notifications: a personal inbox. Insert only happens through
  -- create_notification() (security definer), never directly.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notifications'
  loop
    execute format('drop policy %I on public.notifications', pol.policyname);
  end loop;
  execute 'create policy "notifications_self_read" '
    || 'on public.notifications for select to authenticated using (user_id = auth.uid())';
  execute 'create policy "notifications_self_update" '
    || 'on public.notifications for update to authenticated '
    || 'using (user_id = auth.uid()) with check (user_id = auth.uid())';
  execute 'create policy "notifications_self_delete" '
    || 'on public.notifications for delete to authenticated using (user_id = auth.uid())';

  -- notification_preferences: personal, per business.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'notification_preferences'
  loop
    execute format('drop policy %I on public.notification_preferences', pol.policyname);
  end loop;
  execute 'create policy "notification_preferences_self_read" '
    || 'on public.notification_preferences for select to authenticated using (user_id = auth.uid())';
  execute 'create policy "notification_preferences_self_write" '
    || 'on public.notification_preferences for all to authenticated '
    || 'using (user_id = auth.uid() and public.is_member(business_id)) '
    || 'with check (user_id = auth.uid() and public.is_member(business_id))';

  -- push_subscriptions: personal device endpoints.
  for pol in
    select policyname from pg_policies
     where schemaname = 'public' and tablename = 'push_subscriptions'
  loop
    execute format('drop policy %I on public.push_subscriptions', pol.policyname);
  end loop;
  execute 'create policy "push_subscriptions_self_read" '
    || 'on public.push_subscriptions for select to authenticated using (user_id = auth.uid())';
  execute 'create policy "push_subscriptions_self_write" '
    || 'on public.push_subscriptions for all to authenticated '
    || 'using (user_id = auth.uid() and public.is_member(business_id)) '
    || 'with check (user_id = auth.uid() and public.is_member(business_id))';
end $$;

-- 7. Rule engine ------------------------------------------------------------

/**
 * Evaluate every business rule and raise the matching notifications.
 *
 * Called by the open app (so alerts appear immediately) and by the cron job
 * (so alerts also arrive when the app is closed). Each rule runs in its own
 * block: a failure in one rule never stops the others.
 *
 * Returns the number of workspaces evaluated.
 */
create or replace function public.evaluate_notification_rules(p_business_id uuid default null)
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_business uuid;
  v_service boolean := coalesce(auth.role(), '') = 'service_role';
  v_total integer := 0;
  v_tz text := 'UTC';
  v_today date;
  v_month text;
  v_month_start date;
  v_now_ts timestamptz := now();
  v_count integer;
  v_names text;
  v_num numeric;
  v_num2 numeric;
  v_last_date date;
  v_closing time;
  v_setting public.notification_settings%rowtype;
begin
  -- The engine flag lets create_notification() skip the "you may only raise
  -- what you receive" check: the caller already proved membership below.
  perform set_config('pixo.notification_engine', '1', true);

  for v_business in
    select b.id
      from public.businesses b
     where (p_business_id is null or b.id = p_business_id)
       and (v_service or public.is_member(b.id))
  loop
    v_count := 0;

    -- Shop timezone drives every date boundary in the rules.
    begin
      select coalesce(ss.timezone, 'UTC') into v_tz
        from public.shop_settings ss
       where ss.business_id = v_business
       limit 1;
    exception when others then
      v_tz := null;
    end;
    if v_tz is null then
      begin
        select coalesce(ss.timezone, 'UTC') into v_tz
          from public.shop_settings ss
         where ss.id = 'main'
         limit 1;
      exception when others then
        v_tz := 'UTC';
      end;
    end if;
    if v_tz is null then
      v_tz := 'UTC';
    end if;

    v_today := (v_now_ts at time zone v_tz)::date;
    v_month := to_char(v_today, 'YYYY-MM');
    v_month_start := date_trunc('month', v_now_ts at time zone v_tz)::date;

    select * into v_setting
      from public.notification_settings
     where business_id = v_business;
    v_closing := coalesce(v_setting.closing_reminder_time, '19:00'::time);

    ------------------------------------------------------------------
    -- Low stock
    ------------------------------------------------------------------
    begin
      select count(*), coalesce(string_agg(i.name, ', ' order by i.stock asc), '')
        into v_count, v_names
        from public.items i
       where i.business_id = v_business
         and (
           i.item_type in ('material', 'intermediate', 'ready')
           or (i.item_type is null and coalesce(i.is_material, false))
         )
         and coalesce(i.stock, 0) <= coalesce(i.low_stock_threshold, 10);

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'stock.low',
          format('%s product%s at or below the reorder level', v_count, case when v_count = 1 then '' else 's' end),
          left(v_names, 300),
          '/inventory',
          jsonb_build_object('count', v_count),
          'stock.low:' || v_today::text || ':' || v_count::text,
          'warning'
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Stock take overdue
    ------------------------------------------------------------------
    begin
      select max(sa.adjustment_date) into v_last_date
        from public.stock_adjustments sa
       where sa.business_id = v_business
         and sa.adjustment_type = 'stocktake';

      if v_last_date is null or v_last_date < (v_today - 7) then
        perform public.create_notification(
          v_business, 'stock.take.due',
          'Stock take due',
          case when v_last_date is null
               then 'No stock take has been recorded yet. Count the shelves to keep the ledger honest.'
               else 'The last stock take was on ' || v_last_date::text || '. Count the shelves to keep the ledger honest.'
          end,
          '/stock-taking',
          jsonb_build_object('last_stock_take', v_last_date),
          'stock.take.due:' || v_today::text
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Purchase orders in flight / overdue / stale drafts
    ------------------------------------------------------------------
    begin
      select count(*) into v_count
        from public.purchase_orders po
       where po.business_id = v_business
         and po.status = 'ordered';

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'po.progress',
          format('%s purchase order%s awaiting delivery', v_count, case when v_count = 1 then '' else 's' end),
          'Follow up with the supplier so the shelf is restocked before the next selling day.',
          '/purchase-orders',
          jsonb_build_object('count', v_count),
          'po.progress:' || v_today::text || ':' || v_count::text
        );
      end if;

      select count(*), coalesce(string_agg(po.number || ' (' || po.vendor || ')', ', '), '')
        into v_count, v_names
        from public.purchase_orders po
       where po.business_id = v_business
         and po.status = 'ordered'
         and po.expected_date is not null
         and po.expected_date < v_today;

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'po.overdue',
          format('%s purchase order%s past the expected date', v_count, case when v_count = 1 then '' else 's' end),
          left(v_names, 300),
          '/purchase-orders',
          jsonb_build_object('count', v_count),
          'po.overdue:' || v_today::text || ':' || v_count::text,
          'critical'
        );
      end if;

      select count(*) into v_count
        from public.purchase_orders po
       where po.business_id = v_business
         and po.status = 'draft'
         and po.created_at < v_now_ts - interval '3 days';

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'po.draft.stale',
          format('%s purchase order%s still in draft', v_count, case when v_count = 1 then '' else 's' end),
          'Send the order or remove the draft so stock planning stays accurate.',
          '/purchase-orders',
          jsonb_build_object('count', v_count),
          'po.draft.stale:' || v_today::text || ':' || v_count::text
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Monthly peak sales + top customer
    ------------------------------------------------------------------
    begin
      with monthly as (
        select to_char(date_trunc('month', s.created_at at time zone v_tz), 'YYYY-MM') as mth,
               sum(coalesce(s.total, 0)) as revenue
          from public.sales s
         where s.business_id = v_business
           and s.voided_at is null
         group by 1
      )
      select
        (select revenue from monthly where mth = v_month),
        (select max(revenue) from monthly where mth < v_month)
        into v_num, v_num2;

      if v_num is not null and v_num2 is not null and v_num > v_num2 then
        perform public.create_notification(
          v_business, 'sales.peak.month',
          'A new record month',
          'This month is the best trading month so far. Keep the winning products in stock.',
          '/statistics',
          jsonb_build_object('revenue', round(v_num, 2)),
          'sales.peak.month:' || v_month
        );
      end if;

      select c.name, sum(coalesce(s.total, 0))
        into v_names, v_num
        from public.sales s
        join public.customers c on c.id = s.customer_id
       where s.business_id = v_business
         and s.voided_at is null
         and s.customer_id is not null
         and date_trunc('month', s.created_at at time zone v_tz) = v_month_start::timestamp
       group by c.name
       order by 2 desc
       limit 1;

      if v_names is not null then
        perform public.create_notification(
          v_business, 'sales.top.customer',
          'Top customer this month',
          v_names || ' is bringing in the most revenue this month.',
          '/customers',
          jsonb_build_object('customer', v_names, 'revenue', round(v_num, 2)),
          'sales.top.customer:' || v_month
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Daily closing + closing variance
    ------------------------------------------------------------------
    begin
      if (v_now_ts at time zone v_tz)::time >= v_closing then
        select count(*) into v_count
          from public.daily_balancing db
         where db.business_id = v_business
           and db.balance_date = v_today;

        if v_count = 0 then
          perform public.create_notification(
            v_business, 'closing.due',
            'Close the day',
            'The till for ' || v_today::text || ' has not been balanced yet. Count the cash and record the closing balance.',
            '/financial-statements',
            jsonb_build_object('date', v_today::text),
            'closing.due:' || v_today::text
          );
        end if;
      end if;

      select count(*), coalesce(sum(abs(coalesce(db.variance, 0))), 0)
        into v_count, v_num
        from public.daily_balancing db
       where db.business_id = v_business
         and db.balance_date = v_today
         and db.variance is not null
         and abs(db.variance) > 0.01;

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'closing.variance',
          format('%s cash variance on today''s closing', v_count),
          'The counted cash does not match the ledger. Review the till before the next trading day.',
          '/financial-statements',
          jsonb_build_object('count', v_count, 'amount', round(v_num, 2)),
          'closing.variance:' || v_today::text,
          'critical'
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Drawings exceeding expenses (month to date)
    ------------------------------------------------------------------
    begin
      select
        coalesce(sum(case when e.category = 'Drawings' then e.amount else 0 end), 0),
        coalesce(sum(case when e.category <> 'Drawings' then e.amount else 0 end), 0)
        into v_num, v_num2
        from public.expenses e
       where e.business_id = v_business
         and e.expense_date >= v_month_start;

      if v_num > v_num2 and v_num > 0 then
        perform public.create_notification(
          v_business, 'drawings.exceed.expenses',
          'Drawings exceed expenses this month',
          format('Drawings total %s while recorded expenses are %s. Confirm every withdrawal was authorised.', round(v_num, 2), round(v_num2, 2)),
          '/expenses',
          jsonb_build_object('drawings', round(v_num, 2), 'expenses', round(v_num2, 2)),
          'drawings.exceed.expenses:' || v_month,
          'critical'
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Client invoices overdue
    ------------------------------------------------------------------
    begin
      select count(*), coalesce(sum(coalesce(ci.amount_due, 0)), 0)
        into v_count, v_num
        from public.client_invoices ci
       where ci.business_id = v_business
         and ci.status <> 'cancelled'
         and coalesce(ci.amount_due, 0) > 0
         and ci.due_date is not null
         and ci.due_date < v_today;

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'client.invoice.overdue',
          format('%s client invoice%s past due', v_count, case when v_count = 1 then '' else 's' end),
          format('%s is outstanding and needs chasing.', round(v_num, 2)),
          '/client-billing',
          jsonb_build_object('count', v_count, 'amount', round(v_num, 2)),
          'client.invoice.overdue:' || v_today::text || ':' || v_count::text
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Quotes waiting for a decision
    ------------------------------------------------------------------
    begin
      select count(*) into v_count
        from public.quotes q
       where q.business_id = v_business
         and q.status in ('draft', 'sent')
         and q.created_at < v_now_ts - interval '7 days';

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'quote.stale',
          format('%s quote%s waiting for an answer', v_count, case when v_count = 1 then '' else 's' end),
          'Follow up with the customer so the quote turns into an order.',
          '/quotes',
          jsonb_build_object('count', v_count),
          'quote.stale:' || v_today::text || ':' || v_count::text
        );
      end if;
    exception when others then
      null;
    end;

    ------------------------------------------------------------------
    -- Team: approvals waiting + attendance
    ------------------------------------------------------------------
    begin
      select count(*) into v_count
        from public.account_approval_requests ar
       where ar.business_id = v_business
         and ar.status in ('pending', 'pending_first_login', 'pending_approval');

      if v_count > 0 then
        perform public.create_notification(
          v_business, 'staff.approval.pending',
          format('%s account request%s waiting', v_count, case when v_count = 1 then '' else 's' end),
          'Approve or decline the pending account so the team can get to work.',
          '/account-approvals',
          jsonb_build_object('count', v_count),
          'staff.approval.pending:' || v_today::text || ':' || v_count::text
        );
      end if;
    exception when others then
      null;
    end;

    begin
      select count(*) into v_count
        from public.attendance a
       where a.business_id = v_business
         and a.date = v_today;

      select count(*) into v_num2
        from public.business_members bm
        join public.user_profiles up on up.id = bm.user_id
       where bm.business_id = v_business
         and coalesce(up.active, true);

      if coalesce(v_num2, 0) > coalesce(v_count, 0) then
        perform public.create_notification(
          v_business, 'attendance.missing',
          'Attendance not marked',
          format('%s team member(s) have no attendance record today.', coalesce(v_num2, 0) - coalesce(v_count, 0)),
          '/employees',
          jsonb_build_object('missing', coalesce(v_num2, 0) - coalesce(v_count, 0)),
          'attendance.missing:' || v_today::text
        );
      end if;
    exception when others then
      null;
    end;

    v_total := v_total + 1;
  end loop;

  return v_total;
end;
$$;

grant execute on function public.evaluate_notification_rules(uuid) to authenticated, service_role;
grant execute on function public.create_notification(uuid, text, text, text, text, jsonb, text, text, text) to authenticated, service_role;
grant execute on function public.notification_recipients_for(uuid, text) to authenticated, service_role;
grant execute on function public.profile_permission_list(uuid) to authenticated, service_role;
grant execute on function public.notification_role_rank(text) to authenticated, service_role;

-- 8. Scheduled evaluation --------------------------------------------------
-- The same hourly tick the client-billing job uses. The edge function
-- re-evaluates the rules and delivers whatever the gate selected to the
-- devices that asked for it. The rule engine reads the shop timezone itself,
-- so a shop in another country is never evaluated at 3am local time.

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.notification_trigger_digest()
returns bigint
language plpgsql
security definer
set search_path = public, net, vault
as $fn$
declare
  v_url text;
  v_key text;
  v_request_id bigint;
begin
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
    url := rtrim(v_url, '/') || '/functions/v1/notification-digest',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer ' || v_key
    ),
    body := jsonb_build_object('mode', 'auto'),
    timeout_milliseconds := 120000
  ) into v_request_id;

  return v_request_id;
end;
$fn$;

revoke all on function public.notification_trigger_digest() from public;
grant execute on function public.notification_trigger_digest()
  to postgres, service_role;

do $cron$
begin
  if exists (select 1 from cron.job where jobname = 'notification-digest') then
    perform cron.unschedule('notification-digest');
  end if;
  perform cron.schedule(
    'notification-digest',
    '0 * * * *',
    $job$select public.notification_trigger_digest();$job$
  );
end
$cron$;

-- 9. API cache --------------------------------------------------------------

notify pgrst, 'reload schema';
