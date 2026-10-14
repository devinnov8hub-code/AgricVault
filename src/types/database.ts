/**
 * Database types.
 *
 * Hand-maintained to match supabase/migrations/20261013090000_init.sql.
 * Regenerate after any schema change rather than editing by hand:
 *
 *   npm run db:types
 */

export type Json = string | number | boolean | null | { [key: string]: Json } | Json[]

export type UserRole = "admin" | "farmer"
export type AccountStatus = "active" | "inactive" | "suspended"
export type BookingStatus = "pending" | "confirmed" | "cancelled"
export type BatchStatus = "stored" | "partially_withdrawn" | "withdrawn" | "expired"
export type WithdrawalStatus = "pending" | "approved" | "rejected" | "collected"
export type PaymentMethod = "cash" | "transfer" | "pos" | "card" | "ussd"
export type PaymentStatus = "due" | "part_paid" | "paid"
export type AlertType =
  | "temperature_high"
  | "temperature_low"
  | "humidity_high"
  | "humidity_low"
  | "power_low"
  | "device_offline"
export type AlertSeverity = "warning" | "critical"
export type AlertStatus = "open" | "acknowledged" | "resolved"
export type NotificationCategory = "alert" | "withdrawal" | "payment" | "storage" | "account"
export type EmailStatus = "queued" | "sent" | "failed"

export type Profile = {
  id: string
  role: UserRole
  full_name: string
  email: string
  phone: string | null
  address: string | null
  avatar_url: string | null
  status: AccountStatus
  created_at: string
  updated_at: string
}

export type Facility = {
  id: string
  name: string
  location: string | null
  capacity_kg: number
  timezone: string
  created_at: string
  updated_at: string
}

export type FacilitySettings = {
  facility_id: string
  temperature_min_c: number
  temperature_max_c: number
  humidity_min_pct: number
  humidity_max_pct: number
  tariff_kobo_per_tonne_month: number
  notify_sms: boolean
  notify_whatsapp: boolean
  notify_email: boolean
  alert_phone: string | null
  alert_email: string | null
  updated_by: string | null
  updated_at: string
}

export type StorageUnit = {
  id: string
  facility_id: string
  code: string
  name: string | null
  capacity_kg: number
  created_at: string
}

/** The sensor rig in a cold room, and the last thing we heard from it. */
export type Device = {
  id: string
  unit_id: string
  device_id: string
  online: boolean
  last_seen_at: string | null
  thresholds: DeviceThresholds | null
  created_at: string
  updated_at: string
}

/** The thresholds the rig itself is running, mirrored from Firebase. */
export type DeviceThresholds = {
  highTempThreshold: number | null
  lowTempThreshold: number | null
  highHumThreshold: number | null
  lowHumThreshold: number | null
}

/** What a farmer may learn about conditions — a verdict, never a number. */
export type StorageConditions = {
  verdict: "in_range" | "out_of_range" | "stale" | "unknown"
  checked_at: string | null
}

export type ProduceType = {
  id: string
  facility_id: string
  name: string
  is_active: boolean
  created_at: string
}

export type Booking = {
  id: string
  reference: string
  farmer_id: string
  produce_id: string | null
  unit_id: string | null
  quantity_kg: number
  months: number
  rate_kobo: number
  amount_kobo: number
  status: BookingStatus
  created_at: string
  updated_at: string
}

export type StorageBatch = {
  id: string
  reference: string
  farmer_id: string
  unit_id: string
  produce_id: string | null
  booking_id: string | null
  intake_kg: number
  available_kg: number
  stored_at: string
  expires_at: string
  status: BatchStatus
  created_by: string | null
  created_at: string
  updated_at: string
}

export type WithdrawalRequest = {
  id: string
  reference: string
  batch_id: string
  farmer_id: string
  quantity_kg: number
  status: WithdrawalStatus
  note: string | null
  decided_by: string | null
  decided_at: string | null
  collected_at: string | null
  created_at: string
  updated_at: string
}

export type Payment = {
  id: string
  receipt_no: string
  farmer_id: string
  batch_id: string | null
  booking_id: string | null
  tonnes: number
  months: number
  rate_kobo: number
  amount_kobo: number
  paid_kobo: number
  balance_kobo: number
  status: PaymentStatus
  method: PaymentMethod | null
  transaction_ref: string | null
  recorded_by: string | null
  paid_at: string | null
  created_at: string
  updated_at: string
}

export type SensorReading = {
  id: number
  unit_id: string
  temperature_c: number
  humidity_pct: number
  battery_pct: number | null
  recorded_at: string
  created_at: string
}

export type Alert = {
  id: string
  unit_id: string | null
  reading_id: number | null
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  title: string
  detail: string | null
  raised_at: string
  acknowledged_by: string | null
  acknowledged_at: string | null
  resolved_at: string | null
}

export type Notification = {
  id: string
  recipient_id: string
  category: NotificationCategory
  title: string
  body: string | null
  link: string | null
  read_at: string | null
  created_at: string
}

export type EmailLogEntry = {
  id: string
  recipient_email: string
  recipient_id: string | null
  template: string
  subject: string
  payload: Json
  provider_message_id: string | null
  status: EmailStatus
  error: string | null
  created_at: string
  sent_at: string | null
}

/* -- Views ----------------------------------------------------------------- */

export type UserDirectoryRow = {
  id: string
  full_name: string
  email: string
  phone: string | null
  status: AccountStatus
  created_at: string
  units: string
  stored_kg: number
  balance_kobo: number
}

export type BatchDetailRow = {
  id: string
  reference: string
  farmer_id: string
  farmer_name: string
  farmer_phone: string | null
  unit_code: string
  produce_name: string | null
  intake_kg: number
  available_kg: number
  stored_at: string
  expires_at: string
  status: BatchStatus
  days_remaining: number
}

export type PaymentDetailRow = {
  id: string
  receipt_no: string
  farmer_id: string
  farmer_name: string
  farmer_phone: string | null
  batch_reference: string | null
  tonnes: number
  months: number
  rate_kobo: number
  amount_kobo: number
  paid_kobo: number
  balance_kobo: number
  status: PaymentStatus
  method: PaymentMethod | null
  transaction_ref: string | null
  paid_at: string | null
  created_at: string
  recorded_by_name: string | null
}

/** The only slice of facility_settings a farmer can read. */
export type StorageTariffRow = {
  facility_id: string
  tariff_kobo_per_tonne_month: number
}

export type FacilityOverviewRow = {
  facility_id: string
  facility_name: string
  capacity_kg: number
  stored_kg: number
  utilisation_pct: number
  active_farmers: number
  open_alerts: number
  pending_withdrawals: number
}

/* -- Client shape ---------------------------------------------------------- */

type Table<Row, Insert = Partial<Row>, Update = Partial<Row>> = {
  Row: Row
  Insert: Insert
  Update: Update
  Relationships: []
}

type View<Row> = { Row: Row; Relationships: [] }

export type Database = {
  public: {
    Tables: {
      profiles: Table<Profile>
      facilities: Table<Facility>
      facility_settings: Table<FacilitySettings>
      storage_units: Table<StorageUnit>
      devices: Table<Device>
      produce_types: Table<ProduceType>
      bookings: Table<Booking>
      storage_batches: Table<StorageBatch>
      withdrawal_requests: Table<WithdrawalRequest>
      payments: Table<Payment>
      sensor_readings: Table<SensorReading>
      alerts: Table<Alert>
      notifications: Table<Notification>
      email_log: Table<EmailLogEntry>
    }
    Views: {
      v_user_directory: View<UserDirectoryRow>
      v_batch_detail: View<BatchDetailRow>
      v_payment_detail: View<PaymentDetailRow>
      v_facility_overview: View<FacilityOverviewRow>
      v_storage_tariff: View<StorageTariffRow>
    }
    Functions: {
      is_admin: { Args: Record<string, never>; Returns: boolean }
      storage_conditions: { Args: Record<string, never>; Returns: StorageConditions[] }
      expire_due_batches: { Args: Record<string, never>; Returns: number }
    }
    Enums: {
      user_role: UserRole
      account_status: AccountStatus
      booking_status: BookingStatus
      batch_status: BatchStatus
      withdrawal_status: WithdrawalStatus
      payment_method: PaymentMethod
      payment_status: PaymentStatus
      alert_type: AlertType
      alert_severity: AlertSeverity
      alert_status: AlertStatus
      notification_category: NotificationCategory
      email_status: EmailStatus
    }
    CompositeTypes: Record<string, never>
  }
}
