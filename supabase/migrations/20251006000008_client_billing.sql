-- Client Billing schema: clients, services, work entries, billing periods,
-- invoices and invoice payments.
--
-- The Client Billing UI and hooks were written against these tables, but the
-- tables were never shipped. Without them every request fails with
--   PGRST205  Could not find the table 'public.client_work_entries'
-- which is why the page looks empty instead of showing rows.
--
-- Run: paste into Supabase Dashboard -> SQL Editor -> Run.
-- Safe to re-run: every object is created defensively and existing columns,
-- indexes and foreign keys are left alone.

-- ---------------------------------------------------------------------------
-- Tables
-- ---------------------------------------------------------------------------

create table if not exists public.client_accounts (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  address text,
  branch text,
  po_box text,
  phone text,
  email text,
  tin text,
  vat text,
  contact_persons jsonb not null default '[]'::jsonb,
  staff jsonb not null default '[]'::jsonb,
  payment_details jsonb not null default '{}'::jsonb,
  active boolean not null default true,
  invoice_generation_mode text not null default 'manual'
    check (invoice_generation_mode in ('manual', 'automatic')),
  notes text,
  created_by uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_services (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  name text not null,
  description text,
  unit text not null default 'pc',
  unit_price numeric(14, 2) not null default 0,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_work_entries (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  client_name text,
  work_date date not null default current_date,
  officer text,
  service_id uuid,
  service_name text,
  description text,
  quantity numeric(14, 2) not null default 1,
  unit text default 'pc',
  unit_price numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  amount numeric(14, 2) not null default 0,
  photo_url text,
  document_ref text,
  billing_period text,
  validated boolean not null default false,
  validated_by uuid,
  validated_by_name text,
  validated_at timestamptz,
  invoice_id uuid,
  status text not null default 'unbilled'
    check (status in ('unbilled', 'billed', 'voided')),
  recorded_by uuid,
  recorded_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_billing_periods (
  id uuid primary key default gen_random_uuid(),
  client_id uuid,
  client_name text,
  period_start date not null,
  period_end date not null,
  period_label text,
  status text not null default 'open'
    check (status in ('open', 'ready', 'invoiced', 'closed')),
  invoice_id uuid,
  invoice_number text,
  work_count integer not null default 0,
  total_amount numeric(14, 2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_invoices (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  client_id uuid,
  -- Kept nullable: invoice inserts only send client_snapshot, and the mapper
  -- falls back to client_snapshot.name.
  client_name text,
  client_snapshot jsonb not null default '{}'::jsonb,
  invoice_type text not null default 'monthly'
    check (invoice_type in ('monthly', 'outstanding', 'adjustment')),
  -- Nullable: outstanding-balance invoices only carry billing_period_label.
  billing_period_id uuid,
  billing_period_label text,
  parent_invoice_id uuid,
  issue_date date not null default current_date,
  due_date date,
  subtotal numeric(14, 2) not null default 0,
  discount numeric(14, 2) not null default 0,
  other_charges numeric(14, 2) not null default 0,
  tax numeric(14, 2) not null default 0,
  total numeric(14, 2) not null default 0,
  amount_paid numeric(14, 2) not null default 0,
  amount_due numeric(14, 2) not null default 0,
  status text not null default 'unpaid'
    check (status in ('draft', 'unpaid', 'partial', 'paid', 'overdue', 'cancelled')),
  lines jsonb not null default '[]'::jsonb,
  breakdown jsonb not null default '[]'::jsonb,
  work_entry_ids uuid[] not null default '{}'::uuid[],
  payment_details jsonb not null default '{}'::jsonb,
  amount_in_words text,
  notes text,
  created_by uuid,
  created_by_name text,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.client_invoice_payments (
  id uuid primary key default gen_random_uuid(),
  number text not null,
  invoice_id uuid not null,
  client_id uuid,
  payment_date date not null default current_date,
  amount numeric(14, 2) not null default 0,
  payment_method text not null default 'cash'
    check (payment_method in ('cash', 'card', 'transfer', 'credit', 'partial')),
  reference text,
  notes text,
  received_by uuid,
  received_by_name text,
  cancelled boolean not null default false,
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancelled_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Column drift repair
--
-- If a partial/older copy of a table already exists, add any missing column
-- with a safe default. Only nullable or defaulted definitions are listed so
-- this can never fail on existing rows.
-- ---------------------------------------------------------------------------

do $repair$
declare
  s record;
begin
  for s in
    select * from (values
      ('client_accounts', 'name', $def$text not null default ''$def$),
      ('client_accounts', 'address', $def$text$def$),
      ('client_accounts', 'branch', $def$text$def$),
      ('client_accounts', 'po_box', $def$text$def$),
      ('client_accounts', 'phone', $def$text$def$),
      ('client_accounts', 'email', $def$text$def$),
      ('client_accounts', 'tin', $def$text$def$),
      ('client_accounts', 'vat', $def$text$def$),
      ('client_accounts', 'contact_persons', $def$jsonb not null default '[]'::jsonb$def$),
      ('client_accounts', 'staff', $def$jsonb not null default '[]'::jsonb$def$),
      ('client_accounts', 'payment_details', $def$jsonb not null default '{}'::jsonb$def$),
      ('client_accounts', 'active', $def$boolean not null default true$def$),
      ('client_accounts', 'invoice_generation_mode', $def$text not null default 'manual'$def$),
      ('client_accounts', 'notes', $def$text$def$),
      ('client_accounts', 'created_by', $def$uuid$def$),
      ('client_accounts', 'created_by_name', $def$text$def$),
      ('client_accounts', 'created_at', $def$timestamptz not null default now()$def$),
      ('client_accounts', 'updated_at', $def$timestamptz not null default now()$def$),

      ('client_services', 'client_id', $def$uuid$def$),
      ('client_services', 'name', $def$text not null default ''$def$),
      ('client_services', 'description', $def$text$def$),
      ('client_services', 'unit', $def$text not null default 'pc'$def$),
      ('client_services', 'unit_price', $def$numeric(14, 2) not null default 0$def$),
      ('client_services', 'active', $def$boolean not null default true$def$),
      ('client_services', 'created_at', $def$timestamptz not null default now()$def$),
      ('client_services', 'updated_at', $def$timestamptz not null default now()$def$),

      ('client_work_entries', 'client_id', $def$uuid$def$),
      ('client_work_entries', 'client_name', $def$text$def$),
      ('client_work_entries', 'work_date', $def$date not null default current_date$def$),
      ('client_work_entries', 'officer', $def$text$def$),
      ('client_work_entries', 'service_id', $def$uuid$def$),
      ('client_work_entries', 'service_name', $def$text$def$),
      ('client_work_entries', 'description', $def$text$def$),
      ('client_work_entries', 'quantity', $def$numeric(14, 2) not null default 1$def$),
      ('client_work_entries', 'unit', $def$text default 'pc'$def$),
      ('client_work_entries', 'unit_price', $def$numeric(14, 2) not null default 0$def$),
      ('client_work_entries', 'discount', $def$numeric(14, 2) not null default 0$def$),
      ('client_work_entries', 'amount', $def$numeric(14, 2) not null default 0$def$),
      ('client_work_entries', 'photo_url', $def$text$def$),
      ('client_work_entries', 'document_ref', $def$text$def$),
      ('client_work_entries', 'billing_period', $def$text$def$),
      ('client_work_entries', 'validated', $def$boolean not null default false$def$),
      ('client_work_entries', 'validated_by', $def$uuid$def$),
      ('client_work_entries', 'validated_by_name', $def$text$def$),
      ('client_work_entries', 'validated_at', $def$timestamptz$def$),
      ('client_work_entries', 'invoice_id', $def$uuid$def$),
      ('client_work_entries', 'status', $def$text not null default 'unbilled'$def$),
      ('client_work_entries', 'recorded_by', $def$uuid$def$),
      ('client_work_entries', 'recorded_by_name', $def$text$def$),
      ('client_work_entries', 'created_at', $def$timestamptz not null default now()$def$),
      ('client_work_entries', 'updated_at', $def$timestamptz not null default now()$def$),

      ('client_billing_periods', 'client_id', $def$uuid$def$),
      ('client_billing_periods', 'client_name', $def$text$def$),
      ('client_billing_periods', 'period_start', $def$date$def$),
      ('client_billing_periods', 'period_end', $def$date$def$),
      ('client_billing_periods', 'period_label', $def$text$def$),
      ('client_billing_periods', 'status', $def$text not null default 'open'$def$),
      ('client_billing_periods', 'invoice_id', $def$uuid$def$),
      ('client_billing_periods', 'invoice_number', $def$text$def$),
      ('client_billing_periods', 'work_count', $def$integer not null default 0$def$),
      ('client_billing_periods', 'total_amount', $def$numeric(14, 2) not null default 0$def$),
      ('client_billing_periods', 'created_at', $def$timestamptz not null default now()$def$),
      ('client_billing_periods', 'updated_at', $def$timestamptz not null default now()$def$),

      ('client_invoices', 'number', $def$text not null default ''$def$),
      ('client_invoices', 'client_id', $def$uuid$def$),
      ('client_invoices', 'client_name', $def$text$def$),
      ('client_invoices', 'client_snapshot', $def$jsonb not null default '{}'::jsonb$def$),
      ('client_invoices', 'invoice_type', $def$text not null default 'monthly'$def$),
      ('client_invoices', 'billing_period_id', $def$uuid$def$),
      ('client_invoices', 'billing_period_label', $def$text$def$),
      ('client_invoices', 'parent_invoice_id', $def$uuid$def$),
      ('client_invoices', 'issue_date', $def$date not null default current_date$def$),
      ('client_invoices', 'due_date', $def$date$def$),
      ('client_invoices', 'subtotal', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'discount', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'other_charges', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'tax', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'total', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'amount_paid', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'amount_due', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoices', 'status', $def$text not null default 'unpaid'$def$),
      ('client_invoices', 'lines', $def$jsonb not null default '[]'::jsonb$def$),
      ('client_invoices', 'breakdown', $def$jsonb not null default '[]'::jsonb$def$),
      ('client_invoices', 'work_entry_ids', $def$uuid[] not null default '{}'::uuid[]$def$),
      ('client_invoices', 'payment_details', $def$jsonb not null default '{}'::jsonb$def$),
      ('client_invoices', 'amount_in_words', $def$text$def$),
      ('client_invoices', 'notes', $def$text$def$),
      ('client_invoices', 'created_by', $def$uuid$def$),
      ('client_invoices', 'created_by_name', $def$text$def$),
      ('client_invoices', 'cancelled_at', $def$timestamptz$def$),
      ('client_invoices', 'cancelled_by', $def$uuid$def$),
      ('client_invoices', 'cancelled_reason', $def$text$def$),
      ('client_invoices', 'created_at', $def$timestamptz not null default now()$def$),
      ('client_invoices', 'updated_at', $def$timestamptz not null default now()$def$),

      ('client_invoice_payments', 'number', $def$text not null default ''$def$),
      ('client_invoice_payments', 'invoice_id', $def$uuid$def$),
      ('client_invoice_payments', 'client_id', $def$uuid$def$),
      ('client_invoice_payments', 'payment_date', $def$date not null default current_date$def$),
      ('client_invoice_payments', 'amount', $def$numeric(14, 2) not null default 0$def$),
      ('client_invoice_payments', 'payment_method', $def$text not null default 'cash'$def$),
      ('client_invoice_payments', 'reference', $def$text$def$),
      ('client_invoice_payments', 'notes', $def$text$def$),
      ('client_invoice_payments', 'received_by', $def$uuid$def$),
      ('client_invoice_payments', 'received_by_name', $def$text$def$),
      ('client_invoice_payments', 'cancelled', $def$boolean not null default false$def$),
      ('client_invoice_payments', 'cancelled_at', $def$timestamptz$def$),
      ('client_invoice_payments', 'cancelled_by', $def$uuid$def$),
      ('client_invoice_payments', 'cancelled_reason', $def$text$def$),
      ('client_invoice_payments', 'created_at', $def$timestamptz not null default now()$def$),
      ('client_invoice_payments', 'updated_at', $def$timestamptz not null default now()$def$)
    ) as v(tbl, col, def)
  loop
    execute format(
      'alter table public.%I add column if not exists %I %s',
      s.tbl, s.col, s.def
    );
  end loop;
end
$repair$;

-- ---------------------------------------------------------------------------
-- Foreign keys
--
-- Added separately (and only when absent) because client_invoices <->
-- client_billing_periods is circular and an existing table may already carry
-- some of these constraints under a different name.
-- ---------------------------------------------------------------------------

do $fks$
declare
  f record;
begin
  for f in
    select * from (values
      ('client_services', 'client_services_client_id_fkey', 'client_id', 'client_accounts', 'cascade'),
      ('client_work_entries', 'client_work_entries_client_id_fkey', 'client_id', 'client_accounts', 'cascade'),
      ('client_work_entries', 'client_work_entries_service_id_fkey', 'service_id', 'client_services', 'set null'),
      ('client_work_entries', 'client_work_entries_invoice_id_fkey', 'invoice_id', 'client_invoices', 'set null'),
      ('client_billing_periods', 'client_billing_periods_client_id_fkey', 'client_id', 'client_accounts', 'cascade'),
      ('client_billing_periods', 'client_billing_periods_invoice_id_fkey', 'invoice_id', 'client_invoices', 'set null'),
      ('client_invoices', 'client_invoices_client_id_fkey', 'client_id', 'client_accounts', 'set null'),
      ('client_invoices', 'client_invoices_billing_period_id_fkey', 'billing_period_id', 'client_billing_periods', 'set null'),
      ('client_invoices', 'client_invoices_parent_invoice_id_fkey', 'parent_invoice_id', 'client_invoices', 'set null'),
      -- Financial rows must not disappear when an invoice is deleted: fail closed.
      ('client_invoice_payments', 'client_invoice_payments_invoice_id_fkey', 'invoice_id', 'client_invoices', 'restrict'),
      ('client_invoice_payments', 'client_invoice_payments_client_id_fkey', 'client_id', 'client_accounts', 'set null')
    ) as v(tbl, conname, col, parent, on_delete)
  loop
    if not exists (
      select 1 from pg_constraint
      where conname = f.conname
        and conrelid = format('public.%I', f.tbl)::regclass
    ) then
      execute format(
        'alter table public.%I add constraint %I foreign key (%I) references public.%I(id) on delete %s',
        f.tbl, f.conname, f.col, f.parent, f.on_delete
      );
    end if;
  end loop;
end
$fks$;

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

create unique index if not exists client_invoices_number_key
  on public.client_invoices (number);
create unique index if not exists client_invoice_payments_number_key
  on public.client_invoice_payments (number);
create unique index if not exists client_billing_periods_client_period_key
  on public.client_billing_periods (client_id, period_start);

-- One live monthly invoice per period, one live outstanding invoice per
-- parent invoice.
create unique index if not exists client_invoices_one_monthly_per_period_idx
  on public.client_invoices (billing_period_id)
  where invoice_type = 'monthly'
    and status <> 'cancelled'
    and billing_period_id is not null;
create unique index if not exists client_invoices_one_outstanding_per_parent_idx
  on public.client_invoices (parent_invoice_id)
  where invoice_type = 'outstanding'
    and status <> 'cancelled'
    and parent_invoice_id is not null;

create index if not exists client_services_client_id_idx
  on public.client_services (client_id);

create index if not exists client_work_entries_client_date_idx
  on public.client_work_entries (client_id, work_date desc, created_at desc);
create index if not exists client_work_entries_billing_period_idx
  on public.client_work_entries (billing_period);
create index if not exists client_work_entries_status_validated_idx
  on public.client_work_entries (status, validated);
create index if not exists client_work_entries_invoice_id_idx
  on public.client_work_entries (invoice_id);

create index if not exists client_invoices_client_date_idx
  on public.client_invoices (client_id, issue_date desc);
create index if not exists client_invoices_status_idx
  on public.client_invoices (status);
create index if not exists client_invoices_billing_period_id_idx
  on public.client_invoices (billing_period_id);
create index if not exists client_invoices_parent_invoice_id_idx
  on public.client_invoices (parent_invoice_id);

create index if not exists client_invoice_payments_invoice_date_idx
  on public.client_invoice_payments (invoice_id, payment_date desc);
create index if not exists client_invoice_payments_client_date_idx
  on public.client_invoice_payments (client_id, payment_date desc);

-- ---------------------------------------------------------------------------
-- updated_at maintenance
-- ---------------------------------------------------------------------------

create or replace function public.pixo_touch_updated_at()
returns trigger
language plpgsql
as $fn$
begin
  new.updated_at = now();
  return new;
end;
$fn$;

drop trigger if exists set_updated_at on public.client_accounts;
create trigger set_updated_at
  before update on public.client_accounts
  for each row execute function public.pixo_touch_updated_at();

drop trigger if exists set_updated_at on public.client_services;
create trigger set_updated_at
  before update on public.client_services
  for each row execute function public.pixo_touch_updated_at();

drop trigger if exists set_updated_at on public.client_work_entries;
create trigger set_updated_at
  before update on public.client_work_entries
  for each row execute function public.pixo_touch_updated_at();

drop trigger if exists set_updated_at on public.client_billing_periods;
create trigger set_updated_at
  before update on public.client_billing_periods
  for each row execute function public.pixo_touch_updated_at();

drop trigger if exists set_updated_at on public.client_invoices;
create trigger set_updated_at
  before update on public.client_invoices
  for each row execute function public.pixo_touch_updated_at();

drop trigger if exists set_updated_at on public.client_invoice_payments;
create trigger set_updated_at
  before update on public.client_invoice_payments
  for each row execute function public.pixo_touch_updated_at();

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

alter table public.client_accounts enable row level security;
drop policy if exists "client_accounts_authenticated_all" on public.client_accounts;
create policy "client_accounts_authenticated_all" on public.client_accounts
  for all to authenticated using (true) with check (true);

alter table public.client_services enable row level security;
drop policy if exists "client_services_authenticated_all" on public.client_services;
create policy "client_services_authenticated_all" on public.client_services
  for all to authenticated using (true) with check (true);

alter table public.client_work_entries enable row level security;
drop policy if exists "client_work_entries_authenticated_all" on public.client_work_entries;
create policy "client_work_entries_authenticated_all" on public.client_work_entries
  for all to authenticated using (true) with check (true);

alter table public.client_billing_periods enable row level security;
drop policy if exists "client_billing_periods_authenticated_all" on public.client_billing_periods;
create policy "client_billing_periods_authenticated_all" on public.client_billing_periods
  for all to authenticated using (true) with check (true);

alter table public.client_invoices enable row level security;
drop policy if exists "client_invoices_authenticated_all" on public.client_invoices;
create policy "client_invoices_authenticated_all" on public.client_invoices
  for all to authenticated using (true) with check (true);

alter table public.client_invoice_payments enable row level security;
drop policy if exists "client_invoice_payments_authenticated_all" on public.client_invoice_payments;
create policy "client_invoice_payments_authenticated_all" on public.client_invoice_payments
  for all to authenticated using (true) with check (true);

-- ---------------------------------------------------------------------------
-- Table privileges
-- RLS policies only authorize roles that already hold table-level grants.
-- service_role is used by the generate-monthly-invoices edge function and the
-- pg_cron job, so grant it explicitly (it is not covered by the policies above).
-- ---------------------------------------------------------------------------

grant usage on schema public to authenticated, service_role;

grant select, insert, update, delete on
  public.client_accounts,
  public.client_services,
  public.client_work_entries,
  public.client_billing_periods,
  public.client_invoices,
  public.client_invoice_payments
to authenticated;

grant select, insert, update, delete on
  public.client_accounts,
  public.client_services,
  public.client_work_entries,
  public.client_billing_periods,
  public.client_invoices,
  public.client_invoice_payments
to service_role;

