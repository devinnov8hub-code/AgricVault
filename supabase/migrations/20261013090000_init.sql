-- ============================================================================
-- AgriVault — complete schema
--
-- One migration, applied in order:
--   1. Extensions
--   2. Enums
--   3. Helper functions (security definer, used by RLS)
--   4. Tables
--   5. Indexes
--   6. Triggers and domain logic
--   7. Views
--   8. Row Level Security
--   9. Storage buckets
--  10. Realtime
--
-- Conventions
--   * Money is stored as integer kobo. Never floats.
--   * Weight is stored as integer grams-free kilograms (numeric(12,2) kg).
--   * Every table carries created_at; mutable tables carry updated_at.
--   * Authorisation lives in RLS, not in the client.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- 1. Extensions
-- ----------------------------------------------------------------------------
create extension if not exists "pgcrypto" with schema extensions;
create extension if not exists "citext" with schema extensions;
create extension if not exists "pg_trgm" with schema extensions;

-- ----------------------------------------------------------------------------
-- 2. Enums
-- ----------------------------------------------------------------------------
create type public.user_role as enum ('admin', 'farmer');
create type public.account_status as enum ('active', 'inactive', 'suspended');

create type public.booking_status as enum ('pending', 'confirmed', 'cancelled');
create type public.batch_status as enum ('stored', 'partially_withdrawn', 'withdrawn', 'expired');
create type public.withdrawal_status as enum ('pending', 'approved', 'rejected', 'collected');

create type public.payment_method as enum ('cash', 'transfer', 'pos', 'card', 'ussd');
create type public.payment_status as enum ('due', 'part_paid', 'paid');

create type public.alert_type as enum (
  'temperature_high',
  'temperature_low',
  'humidity_high',
  'humidity_low',
  'power_low',
  'device_offline'
);
create type public.alert_severity as enum ('warning', 'critical');
create type public.alert_status as enum ('open', 'acknowledged', 'resolved');

create type public.notification_category as enum (
  'alert',
  'withdrawal',
  'payment',
  'storage',
  'account'
);

create type public.email_status as enum ('queued', 'sent', 'failed');

-- ----------------------------------------------------------------------------
-- 3. Helper functions
--
-- These are SECURITY DEFINER so RLS policies can call them without
-- re-triggering RLS on profiles (which would recurse).
-- ----------------------------------------------------------------------------
create or replace function public.auth_role()
returns public.user_role
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select role from public.profiles where id = auth.uid();
$$;

create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public, pg_temp
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'admin' and status = 'active'
  );
$$;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- Human-readable references: ST-0412, WD-0007, RC-0101, BK-0021.
create sequence if not exists public.batch_reference_seq start 1;
create sequence if not exists public.booking_reference_seq start 1;
create sequence if not exists public.withdrawal_reference_seq start 1;
create sequence if not exists public.receipt_reference_seq start 1;

create or replace function public.next_reference(prefix text, seq regclass)
returns text
language sql
volatile
as $$
  select prefix || '-' || lpad(nextval(seq)::text, 4, '0');
$$;

-- ----------------------------------------------------------------------------
-- 4. Tables
-- ----------------------------------------------------------------------------

-- 4.1 People -----------------------------------------------------------------
create table public.profiles (
  id          uuid primary key references auth.users (id) on delete cascade,
  role        public.user_role      not null default 'farmer',
  full_name   text                  not null,
  email       extensions.citext     not null unique,
  phone       text,
  address     text,
  avatar_url  text,
  status      public.account_status not null default 'active',
  created_at  timestamptz           not null default now(),
  updated_at  timestamptz           not null default now(),

  constraint profiles_full_name_not_blank check (length(btrim(full_name)) > 0),
  constraint profiles_phone_shape check (phone is null or phone ~ '^[0-9+][0-9 ()-]{6,19}$')
);

comment on table public.profiles is
  'Application-level user record, one row per auth.users row, created by a trigger on signup.';

-- 4.2 Facility ---------------------------------------------------------------
create table public.facilities (
  id           uuid primary key default gen_random_uuid(),
  name         text        not null,
  location     text,
  capacity_kg  numeric(12,2) not null default 175000 check (capacity_kg > 0),
  timezone     text        not null default 'Africa/Lagos',
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create table public.facility_settings (
  facility_id                 uuid primary key references public.facilities (id) on delete cascade,
  temperature_min_c           numeric(5,2) not null default 7,
  temperature_max_c           numeric(5,2) not null default 13,
  humidity_min_pct            integer      not null default 65,
  humidity_max_pct            integer      not null default 75,
  tariff_kobo_per_tonne_month bigint       not null default 1500000 check (tariff_kobo_per_tonne_month > 0),
  notify_sms                  boolean      not null default true,
  notify_whatsapp             boolean      not null default true,
  notify_email                boolean      not null default true,
  alert_phone                 text,
  alert_email                 extensions.citext,
  updated_by                  uuid references public.profiles (id) on delete set null,
  updated_at                  timestamptz  not null default now(),

  constraint settings_temperature_range check (temperature_min_c < temperature_max_c),
  constraint settings_humidity_range    check (humidity_min_pct < humidity_max_pct),
  constraint settings_humidity_bounds   check (humidity_min_pct >= 0 and humidity_max_pct <= 100)
);

comment on column public.facility_settings.humidity_min_pct is
  'Whole percentage points. The rig uses integers, so the app does too.';
comment on column public.facility_settings.tariff_kobo_per_tonne_month is
  'Storage price in kobo per tonne per month. 1500000 kobo = ₦15,000.';

create table public.storage_units (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  code        text not null,
  name        text,
  capacity_kg numeric(12,2) not null check (capacity_kg > 0),
  created_at  timestamptz not null default now(),

  unique (facility_id, code)
);

comment on table public.storage_units is
  'Cold rooms. Reference data — any signed-in user may read it, so nothing '
  'about the hardware lives here. See public.devices.';

-- The sensor rig, and the last thing we heard from it.
--
-- Separate from storage_units precisely because this is admin-only: a farmer
-- can know their produce is in "Cold room 1" without learning anything about
-- the equipment watching it.
create table public.devices (
  id           uuid primary key default gen_random_uuid(),
  unit_id      uuid not null unique references public.storage_units (id) on delete cascade,
  device_id    text not null unique,
  online       boolean not null default false,
  last_seen_at timestamptz,
  thresholds   jsonb,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

comment on column public.devices.device_id is
  'The node the rig writes in Firebase, reported as onionStorageId.';
comment on column public.devices.thresholds is
  'The thresholds the rig is actually running, as last read from Firebase: '
  '{highTempThreshold, lowTempThreshold, highHumThreshold, lowHumThreshold}. '
  'Advisory only — alerting uses facility_settings.';

create table public.produce_types (
  id          uuid primary key default gen_random_uuid(),
  facility_id uuid not null references public.facilities (id) on delete cascade,
  name        text not null,
  is_active   boolean not null default true,
  created_at  timestamptz not null default now(),

  unique (facility_id, name)
);

-- 4.3 Storage lifecycle ------------------------------------------------------
create table public.bookings (
  id          uuid primary key default gen_random_uuid(),
  reference   text not null unique default public.next_reference('BK', 'public.booking_reference_seq'),
  farmer_id   uuid not null references public.profiles (id) on delete cascade,
  produce_id  uuid references public.produce_types (id) on delete set null,
  unit_id     uuid references public.storage_units (id) on delete set null,
  quantity_kg numeric(12,2) not null check (quantity_kg > 0),
  months      integer       not null check (months between 1 and 24),
  rate_kobo   bigint        not null check (rate_kobo > 0),
  amount_kobo bigint        not null check (amount_kobo >= 0),
  status      public.booking_status not null default 'pending',
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create table public.storage_batches (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique default public.next_reference('ST', 'public.batch_reference_seq'),
  farmer_id    uuid not null references public.profiles (id) on delete cascade,
  unit_id      uuid not null references public.storage_units (id) on delete restrict,
  produce_id   uuid references public.produce_types (id) on delete set null,
  booking_id   uuid references public.bookings (id) on delete set null,
  intake_kg    numeric(12,2) not null check (intake_kg > 0),
  available_kg numeric(12,2) not null check (available_kg >= 0),
  stored_at    timestamptz not null default now(),
  expires_at   timestamptz not null,
  status       public.batch_status not null default 'stored',
  created_by   uuid references public.profiles (id) on delete set null,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint batches_available_within_intake check (available_kg <= intake_kg),
  constraint batches_expiry_after_intake     check (expires_at > stored_at)
);

create table public.withdrawal_requests (
  id           uuid primary key default gen_random_uuid(),
  reference    text not null unique default public.next_reference('WD', 'public.withdrawal_reference_seq'),
  batch_id     uuid not null references public.storage_batches (id) on delete cascade,
  farmer_id    uuid not null references public.profiles (id) on delete cascade,
  quantity_kg  numeric(12,2) not null check (quantity_kg > 0),
  status       public.withdrawal_status not null default 'pending',
  note         text,
  decided_by   uuid references public.profiles (id) on delete set null,
  decided_at   timestamptz,
  collected_at timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),

  constraint withdrawal_decision_consistent check (
    (status = 'pending' and decided_at is null)
    or (status <> 'pending' and decided_at is not null)
  )
);

-- 4.4 Money ------------------------------------------------------------------
create table public.payments (
  id              uuid primary key default gen_random_uuid(),
  receipt_no      text not null unique default public.next_reference('RC', 'public.receipt_reference_seq'),
  farmer_id       uuid not null references public.profiles (id) on delete restrict,
  batch_id        uuid references public.storage_batches (id) on delete set null,
  booking_id      uuid references public.bookings (id) on delete set null,
  tonnes          numeric(8,3) not null check (tonnes > 0),
  months          integer      not null check (months between 1 and 24),
  rate_kobo       bigint       not null check (rate_kobo > 0),
  amount_kobo     bigint       not null check (amount_kobo >= 0),
  paid_kobo       bigint       not null default 0 check (paid_kobo >= 0),
  method          public.payment_method,
  transaction_ref text,
  recorded_by     uuid references public.profiles (id) on delete set null,
  paid_at         timestamptz,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),

  status public.payment_status generated always as (
    case
      when paid_kobo >= amount_kobo then 'paid'::public.payment_status
      when paid_kobo > 0            then 'part_paid'::public.payment_status
      else 'due'::public.payment_status
    end
  ) stored,

  balance_kobo bigint generated always as (greatest(amount_kobo - paid_kobo, 0)) stored,

  constraint payments_not_overpaid check (paid_kobo <= amount_kobo),
  constraint payments_method_present_when_paid check (paid_kobo = 0 or method is not null)
);

-- 4.5 Telemetry --------------------------------------------------------------
create table public.sensor_readings (
  id             bigint generated always as identity primary key,
  unit_id        uuid not null references public.storage_units (id) on delete cascade,
  temperature_c  numeric(5,2) not null check (temperature_c between -40 and 80),
  humidity_pct   numeric(5,2) not null check (humidity_pct between 0 and 100),
  battery_pct    numeric(5,2) check (battery_pct between 0 and 100),
  recorded_at    timestamptz not null default now(),
  created_at     timestamptz not null default now(),

  unique (unit_id, recorded_at)
);

comment on table public.sensor_readings is
  'Append-only climate log. Written by the ingest-reading edge function, never by the browser.';

create table public.alerts (
  id              uuid primary key default gen_random_uuid(),
  unit_id         uuid references public.storage_units (id) on delete cascade,
  reading_id      bigint references public.sensor_readings (id) on delete set null,
  type            public.alert_type     not null,
  severity        public.alert_severity not null,
  status          public.alert_status   not null default 'open',
  title           text not null,
  detail          text,
  raised_at       timestamptz not null default now(),
  acknowledged_by uuid references public.profiles (id) on delete set null,
  acknowledged_at timestamptz,
  resolved_at     timestamptz
);

-- 4.6 Messaging --------------------------------------------------------------
create table public.notifications (
  id           uuid primary key default gen_random_uuid(),
  recipient_id uuid not null references public.profiles (id) on delete cascade,
  category     public.notification_category not null,
  title        text not null,
  body         text,
  link         text,
  read_at      timestamptz,
  created_at   timestamptz not null default now()
);

create table public.email_log (
  id                  uuid primary key default gen_random_uuid(),
  recipient_email     extensions.citext not null,
  recipient_id        uuid references public.profiles (id) on delete set null,
  template            text not null,
  subject             text not null,
  payload             jsonb not null default '{}'::jsonb,
  provider_message_id text,
  status              public.email_status not null default 'queued',
  error               text,
  created_at          timestamptz not null default now(),
  sent_at             timestamptz
);

comment on table public.email_log is
  'Every transactional email the system sends, for support and for debugging deliverability.';

create table public.audit_log (
  id         uuid primary key default gen_random_uuid(),
  actor_id   uuid references public.profiles (id) on delete set null,
  action     text not null,
  entity     text not null,
  entity_id  text,
  data       jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- ----------------------------------------------------------------------------
-- 5. Indexes
-- ----------------------------------------------------------------------------
create index profiles_role_status_idx on public.profiles (role, status);
create index profiles_full_name_trgm  on public.profiles using gin (full_name extensions.gin_trgm_ops);
create index profiles_email_trgm      on public.profiles using gin ((email::text) extensions.gin_trgm_ops);
create index profiles_phone_trgm      on public.profiles using gin (phone extensions.gin_trgm_ops);

create index storage_units_facility_idx on public.storage_units (facility_id);
create index devices_unit_idx on public.devices (unit_id);
create index produce_types_facility_idx on public.produce_types (facility_id) where is_active;

create index bookings_farmer_idx on public.bookings (farmer_id, created_at desc);
create index bookings_status_idx on public.bookings (status) where status = 'pending';

create index batches_reference_trgm on public.storage_batches using gin (reference extensions.gin_trgm_ops);
create index batches_farmer_idx  on public.storage_batches (farmer_id, stored_at desc);
create index batches_unit_idx    on public.storage_batches (unit_id);
create index batches_status_idx  on public.storage_batches (status) where status <> 'withdrawn';
create index batches_expiry_idx  on public.storage_batches (expires_at) where status <> 'withdrawn';

create index withdrawals_farmer_idx on public.withdrawal_requests (farmer_id, created_at desc);
create index withdrawals_batch_idx  on public.withdrawal_requests (batch_id);
create index withdrawals_open_idx   on public.withdrawal_requests (created_at desc) where status = 'pending';

create index payments_receipt_trgm on public.payments using gin (receipt_no extensions.gin_trgm_ops);
create index payments_farmer_idx on public.payments (farmer_id, created_at desc);
create index payments_status_idx on public.payments (status);
create index payments_paid_at_idx on public.payments (paid_at desc nulls last);

create index readings_unit_time_idx on public.sensor_readings (unit_id, recorded_at desc);

create index alerts_open_idx on public.alerts (raised_at desc) where status = 'open';
create index alerts_unit_idx on public.alerts (unit_id, raised_at desc);

create index notifications_recipient_idx on public.notifications (recipient_id, created_at desc);
create index notifications_unread_idx    on public.notifications (recipient_id) where read_at is null;

create index email_log_recipient_idx on public.email_log (recipient_email, created_at desc);
create index audit_log_entity_idx    on public.audit_log (entity, entity_id, created_at desc);

-- ----------------------------------------------------------------------------
-- 6. Triggers and domain logic
-- ----------------------------------------------------------------------------

-- 6.1 updated_at -------------------------------------------------------------
create trigger profiles_set_updated_at
  before update on public.profiles
  for each row execute function public.set_updated_at();

create trigger facilities_set_updated_at
  before update on public.facilities
  for each row execute function public.set_updated_at();

create trigger facility_settings_set_updated_at
  before update on public.facility_settings
  for each row execute function public.set_updated_at();

create trigger devices_set_updated_at
  before update on public.devices
  for each row execute function public.set_updated_at();

create trigger bookings_set_updated_at
  before update on public.bookings
  for each row execute function public.set_updated_at();

create trigger batches_set_updated_at
  before update on public.storage_batches
  for each row execute function public.set_updated_at();

create trigger withdrawals_set_updated_at
  before update on public.withdrawal_requests
  for each row execute function public.set_updated_at();

create trigger payments_set_updated_at
  before update on public.payments
  for each row execute function public.set_updated_at();

-- 6.2 auth.users -> profiles -------------------------------------------------
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.profiles (id, email, full_name, phone, role)
  values (
    new.id,
    new.email,
    coalesce(
      nullif(btrim(new.raw_user_meta_data ->> 'full_name'), ''),
      split_part(new.email, '@', 1)
    ),
    nullif(btrim(new.raw_user_meta_data ->> 'phone'), ''),
    coalesce(
      nullif(new.raw_user_meta_data ->> 'role', '')::public.user_role,
      'farmer'::public.user_role
    )
  )
  on conflict (id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Keep the email on the profile in step with the one on the auth record.
create or replace function public.handle_user_email_change()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.email is distinct from old.email then
    update public.profiles set email = new.email where id = new.id;
  end if;
  return new;
end;
$$;

create trigger on_auth_user_email_changed
  after update of email on auth.users
  for each row execute function public.handle_user_email_change();

-- 6.3 Climate readings raise alerts -----------------------------------------
create or replace function public.evaluate_reading()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  s            public.facility_settings%rowtype;
  unit_code    text;
  critical_gap numeric := 2;  -- degrees / points beyond the band before it is critical
begin
  select fs.* into s
  from public.facility_settings fs
  join public.storage_units su on su.facility_id = fs.facility_id
  where su.id = new.unit_id;

  if not found then
    return new;
  end if;

  select code into unit_code from public.storage_units where id = new.unit_id;

  if new.temperature_c > s.temperature_max_c then
    insert into public.alerts (unit_id, reading_id, type, severity, title, detail)
    values (
      new.unit_id, new.id, 'temperature_high',
      case when new.temperature_c > s.temperature_max_c + critical_gap
           then 'critical'::public.alert_severity
           else 'warning'::public.alert_severity end,
      'High temperature',
      format('%s read %s°C against a %s–%s°C band.',
             unit_code, new.temperature_c, s.temperature_min_c, s.temperature_max_c)
    );

  elsif new.temperature_c < s.temperature_min_c then
    insert into public.alerts (unit_id, reading_id, type, severity, title, detail)
    values (
      new.unit_id, new.id, 'temperature_low',
      case when new.temperature_c < s.temperature_min_c - critical_gap
           then 'critical'::public.alert_severity
           else 'warning'::public.alert_severity end,
      'Low temperature',
      format('%s read %s°C against a %s–%s°C band.',
             unit_code, new.temperature_c, s.temperature_min_c, s.temperature_max_c)
    );
  end if;

  if new.humidity_pct > s.humidity_max_pct then
    insert into public.alerts (unit_id, reading_id, type, severity, title, detail)
    values (
      new.unit_id, new.id, 'humidity_high',
      case when new.humidity_pct > s.humidity_max_pct + (critical_gap * 2)
           then 'critical'::public.alert_severity
           else 'warning'::public.alert_severity end,
      'High humidity',
      format('%s read %s%% against a %s–%s%% band.',
             unit_code, new.humidity_pct, s.humidity_min_pct, s.humidity_max_pct)
    );

  elsif new.humidity_pct < s.humidity_min_pct then
    insert into public.alerts (unit_id, reading_id, type, severity, title, detail)
    values (
      new.unit_id, new.id, 'humidity_low',
      case when new.humidity_pct < s.humidity_min_pct - (critical_gap * 2)
           then 'critical'::public.alert_severity
           else 'warning'::public.alert_severity end,
      'Low humidity',
      format('%s read %s%% against a %s–%s%% band.',
             unit_code, new.humidity_pct, s.humidity_min_pct, s.humidity_max_pct)
    );
  end if;

  if new.battery_pct is not null and new.battery_pct < 20 then
    insert into public.alerts (unit_id, reading_id, type, severity, title, detail)
    values (new.unit_id, new.id, 'power_low', 'warning', 'Solar battery low',
            format('%s battery at %s%%.', unit_code, new.battery_pct));
  end if;

  return new;
end;
$$;

create trigger sensor_readings_evaluate
  after insert on public.sensor_readings
  for each row execute function public.evaluate_reading();

-- Tell every active admin when something critical is raised.
create or replace function public.notify_admins_of_alert()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  insert into public.notifications (recipient_id, category, title, body, link)
  select p.id, 'alert', new.title, new.detail, '/admin/monitoring'
  from public.profiles p
  where p.role = 'admin' and p.status = 'active';

  return new;
end;
$$;

create trigger alerts_notify_admins
  after insert on public.alerts
  for each row execute function public.notify_admins_of_alert();

-- 6.4 Withdrawals move stock ------------------------------------------------
create or replace function public.apply_withdrawal()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  batch public.storage_batches%rowtype;
begin
  -- Stock only leaves the building on collection.
  if new.status = 'collected' and old.status is distinct from 'collected' then
    select * into batch from public.storage_batches where id = new.batch_id for update;

    if batch.available_kg < new.quantity_kg then
      raise exception 'Withdrawal of % kg exceeds the % kg available in batch %',
        new.quantity_kg, batch.available_kg, batch.reference
        using errcode = 'check_violation';
    end if;

    update public.storage_batches
    set available_kg = available_kg - new.quantity_kg,
        status = case
          when available_kg - new.quantity_kg = 0 then 'withdrawn'::public.batch_status
          else 'partially_withdrawn'::public.batch_status
        end
    where id = new.batch_id;

    new.collected_at := coalesce(new.collected_at, now());
  end if;

  -- A decision always timestamps itself.
  if new.status <> 'pending' and new.decided_at is null then
    new.decided_at := now();
  end if;

  return new;
end;
$$;

create trigger withdrawals_apply
  before update on public.withdrawal_requests
  for each row execute function public.apply_withdrawal();

-- A farmer cannot request more than is actually sitting in the batch.
create or replace function public.validate_withdrawal_request()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  available numeric;
  pending   numeric;
begin
  select available_kg into available
  from public.storage_batches where id = new.batch_id;

  if available is null then
    raise exception 'Unknown batch %', new.batch_id using errcode = 'foreign_key_violation';
  end if;

  select coalesce(sum(quantity_kg), 0) into pending
  from public.withdrawal_requests
  where batch_id = new.batch_id and status in ('pending', 'approved');

  if pending + new.quantity_kg > available then
    raise exception 'Only % kg is available after requests already in flight', available - pending
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger withdrawals_validate
  before insert on public.withdrawal_requests
  for each row execute function public.validate_withdrawal_request();

-- Tell the farmer when their request is decided.
create or replace function public.notify_withdrawal_decision()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.status is distinct from old.status and new.status <> 'pending' then
    insert into public.notifications (recipient_id, category, title, body, link)
    values (
      new.farmer_id,
      'withdrawal',
      format('Withdrawal %s %s', new.reference, new.status),
      format('%s kg from your storage.', new.quantity_kg),
      '/farmer/dashboard'
    );
  end if;
  return new;
end;
$$;

create trigger withdrawals_notify_farmer
  after update on public.withdrawal_requests
  for each row execute function public.notify_withdrawal_decision();

-- 6.5 Expired batches --------------------------------------------------------
create or replace function public.expire_due_batches()
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  touched integer;
begin
  with expired as (
    update public.storage_batches
    set status = 'expired'
    where expires_at < now()
      and status in ('stored', 'partially_withdrawn')
      and available_kg > 0
    returning farmer_id, reference
  ),
  told as (
    insert into public.notifications (recipient_id, category, title, body, link)
    select farmer_id, 'storage', 'Storage period ended',
           format('Batch %s has reached the end of its paid storage period.', reference),
           '/farmer/dashboard'
    from expired
    returning 1
  )
  select count(*) into touched from told;

  return touched;
end;
$$;

comment on function public.expire_due_batches is
  'Run on a schedule (pg_cron or an edge function) to flip batches past their expiry date.';

-- 6.6 Payment settles its booking -------------------------------------------
create or replace function public.sync_payment_state()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  if new.paid_kobo > 0 and new.paid_at is null then
    new.paid_at := now();
  end if;

  if new.booking_id is not null and new.paid_kobo >= new.amount_kobo then
    update public.bookings set status = 'confirmed' where id = new.booking_id and status = 'pending';
  end if;

  return new;
end;
$$;

create trigger payments_sync_state
  before insert or update on public.payments
  for each row execute function public.sync_payment_state();

create or replace function public.notify_payment_received()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  previous bigint := 0;
begin
  if tg_op = 'UPDATE' then
    previous := old.paid_kobo;
  end if;

  if new.paid_kobo > previous then
    insert into public.notifications (recipient_id, category, title, body, link)
    values (
      new.farmer_id, 'payment', 'Payment recorded',
      format('Receipt %s — %s of %s settled.',
             new.receipt_no,
             to_char(new.paid_kobo / 100.0, 'FM999,999,999'),
             to_char(new.amount_kobo / 100.0, 'FM999,999,999')),
      '/farmer/payments'
    );
  end if;
  return new;
end;
$$;

create trigger payments_notify_farmer
  after insert or update on public.payments
  for each row execute function public.notify_payment_received();

-- 6.7 What a farmer is allowed to know about conditions ----------------------
--
-- The service promise is "your produce is being kept properly", not a stream of
-- sensor values. This returns that promise and nothing else: a verdict, and the
-- age of the last reading. No temperature, no humidity, no thresholds.
--
-- SECURITY DEFINER so it can read telemetry a farmer cannot select directly.
create or replace function public.storage_conditions()
returns table (verdict text, checked_at timestamptz)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
declare
  s        public.facility_settings%rowtype;
  reading  public.sensor_readings%rowtype;
begin
  -- A farmer may only ask while they have produce on site.
  if not exists (
    select 1 from public.storage_batches b
    where b.farmer_id = auth.uid()
      and b.status in ('stored', 'partially_withdrawn')
  ) and not public.is_admin() then
    return;
  end if;

  select * into s from public.facility_settings limit 1;

  select * into reading
  from public.sensor_readings
  order by recorded_at desc
  limit 1;

  if reading.id is null or s.facility_id is null then
    return query select 'unknown'::text, null::timestamptz;
  elsif reading.recorded_at < now() - interval '2 hours' then
    return query select 'stale'::text, reading.recorded_at;
  elsif reading.temperature_c between s.temperature_min_c and s.temperature_max_c
    and reading.humidity_pct between s.humidity_min_pct and s.humidity_max_pct then
    return query select 'in_range'::text, reading.recorded_at;
  else
    return query select 'out_of_range'::text, reading.recorded_at;
  end if;
end;
$$;

revoke all on function public.storage_conditions() from public;
grant execute on function public.storage_conditions() to authenticated;

-- ----------------------------------------------------------------------------
-- 7. Views
--
-- Views inherit RLS from their tables when declared with security_invoker,
-- so admins and farmers see different rows through the same view.
-- ----------------------------------------------------------------------------

create view public.v_user_directory
with (security_invoker = true) as
select
  p.id,
  p.full_name,
  p.email,
  p.phone,
  p.status,
  p.created_at,
  coalesce(string_agg(distinct su.code, ', ' order by su.code), '—') as units,
  coalesce(sum(b.available_kg), 0)                                   as stored_kg,
  coalesce(
    (select sum(pay.balance_kobo) from public.payments pay where pay.farmer_id = p.id),
    0
  )                                                                  as balance_kobo
from public.profiles p
left join public.storage_batches b
  on b.farmer_id = p.id and b.status in ('stored', 'partially_withdrawn')
left join public.storage_units su on su.id = b.unit_id
where p.role = 'farmer'
group by p.id;

create view public.v_batch_detail
with (security_invoker = true) as
select
  b.id,
  b.reference,
  b.farmer_id,
  p.full_name  as farmer_name,
  p.phone      as farmer_phone,
  su.code      as unit_code,
  pt.name      as produce_name,
  b.intake_kg,
  b.available_kg,
  b.stored_at,
  b.expires_at,
  b.status,
  greatest(0, date_part('day', b.expires_at - now()))::int as days_remaining
from public.storage_batches b
join public.profiles p        on p.id = b.farmer_id
join public.storage_units su  on su.id = b.unit_id
left join public.produce_types pt on pt.id = b.produce_id;

create view public.v_payment_detail
with (security_invoker = true) as
select
  pay.id,
  pay.receipt_no,
  pay.farmer_id,
  p.full_name as farmer_name,
  p.phone     as farmer_phone,
  b.reference as batch_reference,
  pay.tonnes,
  pay.months,
  pay.rate_kobo,
  pay.amount_kobo,
  pay.paid_kobo,
  pay.balance_kobo,
  pay.status,
  pay.method,
  pay.transaction_ref,
  pay.paid_at,
  pay.created_at,
  rec.full_name as recorded_by_name
from public.payments pay
join public.profiles p             on p.id = pay.farmer_id
left join public.storage_batches b on b.id = pay.batch_id
left join public.profiles rec      on rec.id = pay.recorded_by;

-- The one field from facility_settings a farmer has any business reading.
-- security_invoker is deliberately OFF: the view is the grant, so the farmer
-- gets the tariff without select on the table that holds the thresholds.
create view public.v_storage_tariff
with (security_invoker = false) as
select
  fs.facility_id,
  fs.tariff_kobo_per_tonne_month
from public.facility_settings fs;

create view public.v_facility_overview
with (security_invoker = true) as
select
  f.id                                                    as facility_id,
  f.name                                                  as facility_name,
  f.capacity_kg,
  coalesce(stored.total_kg, 0)                            as stored_kg,
  round(coalesce(stored.total_kg, 0) / f.capacity_kg * 100, 1) as utilisation_pct,
  coalesce(users.active_farmers, 0)                       as active_farmers,
  coalesce(open_alerts.total, 0)                          as open_alerts,
  coalesce(pending.total, 0)                              as pending_withdrawals
from public.facilities f
left join lateral (
  select sum(b.available_kg) as total_kg
  from public.storage_batches b
  join public.storage_units su on su.id = b.unit_id
  where su.facility_id = f.id and b.status in ('stored', 'partially_withdrawn')
) stored on true
left join lateral (
  select count(*) as active_farmers
  from public.profiles
  where role = 'farmer' and status = 'active'
) users on true
left join lateral (
  select count(*) as total
  from public.alerts a
  join public.storage_units su on su.id = a.unit_id
  where su.facility_id = f.id and a.status = 'open'
) open_alerts on true
left join lateral (
  select count(*) as total
  from public.withdrawal_requests w
  where w.status = 'pending'
) pending on true;

-- ----------------------------------------------------------------------------
-- 8. Row Level Security
--
-- Default stance: deny. Admins see the facility; farmers see themselves.
-- Telemetry is written only by the service role (the ingest function).
-- ----------------------------------------------------------------------------
alter table public.profiles            enable row level security;
alter table public.facilities          enable row level security;
alter table public.facility_settings   enable row level security;
alter table public.storage_units       enable row level security;
alter table public.devices             enable row level security;
alter table public.produce_types       enable row level security;
alter table public.bookings            enable row level security;
alter table public.storage_batches     enable row level security;
alter table public.withdrawal_requests enable row level security;
alter table public.payments            enable row level security;
alter table public.sensor_readings     enable row level security;
alter table public.alerts              enable row level security;
alter table public.notifications       enable row level security;
alter table public.email_log           enable row level security;
alter table public.audit_log           enable row level security;

-- 8.1 profiles ---------------------------------------------------------------
create policy "profiles: read own"
  on public.profiles for select to authenticated
  using (id = auth.uid());

create policy "profiles: admins read all"
  on public.profiles for select to authenticated
  using (public.is_admin());

create policy "profiles: update own"
  on public.profiles for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid() and role = public.auth_role());

create policy "profiles: admins manage"
  on public.profiles for all to authenticated
  using (public.is_admin())
  with check (public.is_admin());

-- 8.2 Facility configuration -------------------------------------------------
create policy "facilities: readable by signed-in users"
  on public.facilities for select to authenticated using (true);

create policy "facilities: admins write"
  on public.facilities for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Thresholds and alert contacts are facility operations, not farmer-facing.
-- Farmers read the price through v_storage_tariff instead.
create policy "settings: admins read"
  on public.facility_settings for select to authenticated using (public.is_admin());

create policy "settings: admins write"
  on public.facility_settings for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "units: readable by signed-in users"
  on public.storage_units for select to authenticated using (true);

create policy "units: admins write"
  on public.storage_units for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- Hardware is facility operations. Admins only, same as telemetry.
create policy "devices: admins only"
  on public.devices for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "produce: readable by signed-in users"
  on public.produce_types for select to authenticated using (true);

create policy "produce: admins write"
  on public.produce_types for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 8.3 Bookings ---------------------------------------------------------------
create policy "bookings: farmer reads own"
  on public.bookings for select to authenticated
  using (farmer_id = auth.uid() or public.is_admin());

create policy "bookings: farmer creates own"
  on public.bookings for insert to authenticated
  with check (farmer_id = auth.uid() or public.is_admin());

create policy "bookings: admins write"
  on public.bookings for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "bookings: admins delete"
  on public.bookings for delete to authenticated using (public.is_admin());

-- 8.4 Batches ----------------------------------------------------------------
create policy "batches: farmer reads own"
  on public.storage_batches for select to authenticated
  using (farmer_id = auth.uid() or public.is_admin());

create policy "batches: admins write"
  on public.storage_batches for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 8.5 Withdrawals ------------------------------------------------------------
create policy "withdrawals: farmer reads own"
  on public.withdrawal_requests for select to authenticated
  using (farmer_id = auth.uid() or public.is_admin());

create policy "withdrawals: farmer requests own"
  on public.withdrawal_requests for insert to authenticated
  with check (
    farmer_id = auth.uid()
    and exists (
      select 1 from public.storage_batches b
      where b.id = batch_id and b.farmer_id = auth.uid()
    )
  );

-- Only an admin decides. A farmer may cancel while it is still pending.
create policy "withdrawals: admins decide"
  on public.withdrawal_requests for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

create policy "withdrawals: farmer withdraws pending request"
  on public.withdrawal_requests for delete to authenticated
  using (farmer_id = auth.uid() and status = 'pending');

-- 8.6 Payments ---------------------------------------------------------------
create policy "payments: farmer reads own"
  on public.payments for select to authenticated
  using (farmer_id = auth.uid() or public.is_admin());

create policy "payments: admins write"
  on public.payments for all to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 8.7 Telemetry --------------------------------------------------------------
-- Hardware telemetry is operational data for the facility, not for the people
-- storing produce. Farmers get a qualitative "conditions are in range" signal
-- derived in the app; they can never read a temperature, a humidity or an
-- alert. Enforced here, so it holds no matter what the UI does.
create policy "readings: admins read"
  on public.sensor_readings for select to authenticated using (public.is_admin());
-- No insert policy: writes come from the service role, which bypasses RLS.

create policy "alerts: admins read"
  on public.alerts for select to authenticated using (public.is_admin());

create policy "alerts: admins resolve"
  on public.alerts for update to authenticated
  using (public.is_admin()) with check (public.is_admin());

-- 8.8 Notifications, logs ----------------------------------------------------
create policy "notifications: read own"
  on public.notifications for select to authenticated
  using (recipient_id = auth.uid());

create policy "notifications: mark own read"
  on public.notifications for update to authenticated
  using (recipient_id = auth.uid()) with check (recipient_id = auth.uid());

create policy "email_log: admins read"
  on public.email_log for select to authenticated using (public.is_admin());

create policy "audit_log: admins read"
  on public.audit_log for select to authenticated using (public.is_admin());

-- ----------------------------------------------------------------------------
-- 9. Storage
-- ----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('avatars', 'avatars', true, 2097152, array['image/png', 'image/jpeg'])
on conflict (id) do nothing;

create policy "avatars: public read"
  on storage.objects for select
  using (bucket_id = 'avatars');

create policy "avatars: owner uploads"
  on storage.objects for insert to authenticated
  with check (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner replaces"
  on storage.objects for update to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

create policy "avatars: owner removes"
  on storage.objects for delete to authenticated
  using (bucket_id = 'avatars' and (storage.foldername(name))[1] = auth.uid()::text);

-- ----------------------------------------------------------------------------
-- 10. Realtime
-- ----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_publication where pubname = 'supabase_realtime') then
    alter publication supabase_realtime add table public.sensor_readings;
    alter publication supabase_realtime add table public.alerts;
    alter publication supabase_realtime add table public.notifications;
    alter publication supabase_realtime add table public.withdrawal_requests;
  end if;
end
$$;

-- ----------------------------------------------------------------------------
-- Grants. RLS still decides row visibility; these only open the door.
-- ----------------------------------------------------------------------------
grant usage on schema public to anon, authenticated;
grant select on all tables in schema public to authenticated;
grant insert, update, delete on
  public.profiles,
  public.facilities,
  public.facility_settings,
  public.storage_units,
  public.devices,
  public.produce_types,
  public.bookings,
  public.storage_batches,
  public.withdrawal_requests,
  public.payments,
  public.alerts,
  public.notifications
to authenticated;
grant select on public.v_storage_tariff to authenticated;
grant usage on all sequences in schema public to authenticated;
