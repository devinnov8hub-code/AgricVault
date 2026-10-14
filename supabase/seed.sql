-- ============================================================================
-- AgriVault — seed data
--
-- Runs after the migration on `supabase db reset`, and can be applied to a
-- hosted project once, by hand, to bootstrap the first admin.
--
-- Accounts created here are confirmed in place (email_confirmed_at is set), so
-- the seeded admin can sign in immediately without touching an inbox. Accounts
-- that sign themselves up go through the real Resend-backed verification flow.
--
--   Admin    admin@agrivault.ng        AgriVault@2026
--   Farmers  amina@agrivault.ng        Farmer@2026
--            kelechi@agrivault.ng      Farmer@2026
--            damilare@agrivault.ng     Farmer@2026
--            mubarak@agrivault.ng      Farmer@2026
--
-- CHANGE THESE BEFORE THE SYSTEM IS EXPOSED TO ANYONE.
-- ============================================================================

-- ----------------------------------------------------------------------------
-- A reusable account factory, dropped again at the end of the file.
-- ----------------------------------------------------------------------------
create or replace function pg_temp.seed_user(
  p_id        uuid,
  p_email     text,
  p_password  text,
  p_full_name text,
  p_role      text,
  p_phone     text default null
)
returns uuid
language plpgsql
as $$
begin
  insert into auth.users (
    instance_id,
    id,
    aud,
    role,
    email,
    encrypted_password,
    email_confirmed_at,
    raw_app_meta_data,
    raw_user_meta_data,
    created_at,
    updated_at,
    confirmation_token,
    recovery_token,
    email_change_token_new,
    email_change
  )
  values (
    '00000000-0000-0000-0000-000000000000',
    p_id,
    'authenticated',
    'authenticated',
    p_email,
    extensions.crypt(p_password, extensions.gen_salt('bf')),
    now(),
    jsonb_build_object('provider', 'email', 'providers', array['email']),
    jsonb_build_object('full_name', p_full_name, 'role', p_role, 'phone', p_phone),
    now(),
    now(),
    '',
    '',
    '',
    ''
  )
  on conflict (id) do nothing;

  -- Without a matching identity row, password sign-in fails on GoTrue.
  insert into auth.identities (
    id,
    user_id,
    provider_id,
    identity_data,
    provider,
    last_sign_in_at,
    created_at,
    updated_at
  )
  values (
    gen_random_uuid(),
    p_id,
    p_id::text,
    jsonb_build_object('sub', p_id::text, 'email', p_email, 'email_verified', true),
    'email',
    now(),
    now(),
    now()
  )
  on conflict (provider, provider_id) do nothing;

  return p_id;
end;
$$;

-- ----------------------------------------------------------------------------
-- Accounts
-- ----------------------------------------------------------------------------
select pg_temp.seed_user(
  '00000000-0000-4000-a000-000000000001',
  'admin@agrivault.ng', 'AgriVault@2026',
  'Patrick Smith', 'admin', '08030000001'
);

select pg_temp.seed_user(
  '00000000-0000-4000-a000-000000000011',
  'amina@agrivault.ng', 'Farmer@2026',
  'Amina Bello', 'farmer', '08115846311'
);

select pg_temp.seed_user(
  '00000000-0000-4000-a000-000000000012',
  'kelechi@agrivault.ng', 'Farmer@2026',
  'Kelechi Samuel', 'farmer', '08115846312'
);

select pg_temp.seed_user(
  '00000000-0000-4000-a000-000000000013',
  'damilare@agrivault.ng', 'Farmer@2026',
  'Damilare Peter', 'farmer', '08115846313'
);

select pg_temp.seed_user(
  '00000000-0000-4000-a000-000000000014',
  'mubarak@agrivault.ng', 'Farmer@2026',
  'Mubarak Yusuf', 'farmer', '08115846314'
);

-- ----------------------------------------------------------------------------
-- Facility
-- ----------------------------------------------------------------------------
insert into public.facilities (id, name, location, capacity_kg, timezone)
values (
  '00000000-0000-4000-b000-000000000001',
  'AgriVault Cold Store, Kano',
  'Dawanau Market, Kano State',
  175000,
  'Africa/Lagos'
)
on conflict (id) do nothing;

insert into public.facility_settings (
  facility_id,
  temperature_min_c, temperature_max_c,
  humidity_min_pct, humidity_max_pct,
  tariff_kobo_per_tonne_month,
  notify_sms, notify_whatsapp, notify_email,
  alert_phone, alert_email,
  updated_by
)
values (
  '00000000-0000-4000-b000-000000000001',
  7, 13,
  65, 75,
  1500000,                      -- ₦15,000 per tonne per month
  true, true, true,
  '08030000001', 'alerts@agrivault.ng',
  '00000000-0000-4000-a000-000000000001'
)
on conflict (facility_id) do nothing;

insert into public.storage_units (id, facility_id, code, name, capacity_kg)
values
  ('00000000-0000-4000-c000-000000000001', '00000000-0000-4000-b000-000000000001', 'U-1', 'Cold room 1', 60000),
  ('00000000-0000-4000-c000-000000000002', '00000000-0000-4000-b000-000000000001', 'U-2', 'Cold room 2', 60000),
  ('00000000-0000-4000-c000-000000000003', '00000000-0000-4000-b000-000000000001', 'U-3', 'Cold room 3', 55000)
on conflict (id) do nothing;

-- device_id must match the node the rig writes in Firebase (onionStorageId).
-- Only store_001 exists on the pilot rig today; map more as they are built.
insert into public.devices (unit_id, device_id, online, last_seen_at)
values ('00000000-0000-4000-c000-000000000001', 'store_001', true, now())
on conflict (device_id) do nothing;

insert into public.produce_types (id, facility_id, name)
values
  ('00000000-0000-4000-d000-000000000001', '00000000-0000-4000-b000-000000000001', 'Onions'),
  ('00000000-0000-4000-d000-000000000002', '00000000-0000-4000-b000-000000000001', 'Yam'),
  ('00000000-0000-4000-d000-000000000003', '00000000-0000-4000-b000-000000000001', 'Tomatoes'),
  ('00000000-0000-4000-d000-000000000004', '00000000-0000-4000-b000-000000000001', 'Sweet potatoes')
on conflict (id) do nothing;

-- ----------------------------------------------------------------------------
-- Stored produce
-- ----------------------------------------------------------------------------
insert into public.storage_batches (
  id, reference, farmer_id, unit_id, produce_id,
  intake_kg, available_kg, stored_at, expires_at, status, created_by
)
values
  ('00000000-0000-4000-e000-000000000001', 'ST-0412',
   '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-c000-000000000001',
   '00000000-0000-4000-d000-000000000001',
   3930, 3930, now() - interval '31 days', now() + interval '29 days', 'stored',
   '00000000-0000-4000-a000-000000000001'),

  ('00000000-0000-4000-e000-000000000002', 'ST-0398',
   '00000000-0000-4000-a000-000000000012', '00000000-0000-4000-c000-000000000001',
   '00000000-0000-4000-d000-000000000001',
   1570, 1570, now() - interval '23 days', now() + interval '7 days', 'stored',
   '00000000-0000-4000-a000-000000000001'),

  ('00000000-0000-4000-e000-000000000003', 'ST-0456',
   '00000000-0000-4000-a000-000000000013', '00000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-d000-000000000002',
   2055, 2055, now() - interval '15 days', now() + interval '75 days', 'stored',
   '00000000-0000-4000-a000-000000000001'),

  ('00000000-0000-4000-e000-000000000004', 'ST-0377',
   '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-c000-000000000002',
   '00000000-0000-4000-d000-000000000001',
   3240, 3240, now() - interval '30 days', now() + interval '3 days', 'stored',
   '00000000-0000-4000-a000-000000000001')
on conflict (id) do nothing;

-- Keep generated references ahead of the seeded ones.
select setval('public.batch_reference_seq', 500, true);
select setval('public.booking_reference_seq', 30, true);
select setval('public.withdrawal_reference_seq', 20, true);
select setval('public.receipt_reference_seq', 110, true);

-- ----------------------------------------------------------------------------
-- Withdrawal requests
-- ----------------------------------------------------------------------------
insert into public.withdrawal_requests (reference, batch_id, farmer_id, quantity_kg, status, decided_at)
values
  ('WD-0001', '00000000-0000-4000-e000-000000000001', '00000000-0000-4000-a000-000000000011', 500, 'pending', null),
  ('WD-0002', '00000000-0000-4000-e000-000000000002', '00000000-0000-4000-a000-000000000012', 200, 'pending', null),
  ('WD-0003', '00000000-0000-4000-e000-000000000004', '00000000-0000-4000-a000-000000000014', 300, 'approved', now() - interval '1 day')
on conflict (reference) do nothing;

-- ----------------------------------------------------------------------------
-- Payments
-- ----------------------------------------------------------------------------
insert into public.payments (
  receipt_no, farmer_id, batch_id, tonnes, months,
  rate_kobo, amount_kobo, paid_kobo, method, transaction_ref, recorded_by, paid_at
)
values
  ('RC-0101', '00000000-0000-4000-a000-000000000011', '00000000-0000-4000-e000-000000000001',
   3.930, 2, 1500000, 11790000, 11790000, 'transfer', 'TRF-8831204',
   '00000000-0000-4000-a000-000000000001', now() - interval '8 days'),

  ('RC-0102', '00000000-0000-4000-a000-000000000012', '00000000-0000-4000-e000-000000000002',
   1.570, 1, 1500000, 2355000, 900000, 'cash', null,
   '00000000-0000-4000-a000-000000000001', now() - interval '11 days'),

  ('RC-0103', '00000000-0000-4000-a000-000000000013', '00000000-0000-4000-e000-000000000003',
   2.055, 3, 1500000, 9247500, 0, null, null,
   '00000000-0000-4000-a000-000000000001', null),

  ('RC-0104', '00000000-0000-4000-a000-000000000014', '00000000-0000-4000-e000-000000000004',
   3.240, 1, 1500000, 4860000, 4860000, 'pos', 'POS-5520914',
   '00000000-0000-4000-a000-000000000001', now() - interval '30 days')
on conflict (receipt_no) do nothing;

-- ----------------------------------------------------------------------------
-- Climate history — 72 hours, one reading an hour, mostly inside the band.
-- The evaluate_reading trigger turns the excursions into alerts on its own.
-- ----------------------------------------------------------------------------
insert into public.sensor_readings (unit_id, temperature_c, humidity_pct, battery_pct, recorded_at)
select
  u.id,
  round((9.5 + sin(h / 3.0) * 1.8 + (case when h = 4 then 5.5 else 0 end))::numeric, 2),
  round((70 + cos(h / 4.0) * 3.5 + (case when h = 9 then 12 else 0 end))::numeric, 2),
  round((88 - h * 0.2 + (case when h = 2 then -72 else 0 end))::numeric, 2),
  now() - (h || ' hours')::interval
from generate_series(0, 71) as h
cross join (
  select id from public.storage_units where code = 'U-1'
) u
on conflict (unit_id, recorded_at) do nothing;

-- Collapse the notification noise the seed just generated.
update public.notifications set read_at = now() where read_at is null and created_at < now();

drop function pg_temp.seed_user(uuid, text, text, text, text, text);
