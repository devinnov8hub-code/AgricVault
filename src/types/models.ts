/**
 * The AgriVault data model, as it lives in Firestore.
 *
 * Two rules worth knowing before you change anything here:
 *
 * 1. MONEY IS INTEGER KOBO. Never a float, never naira. It becomes naira in
 *    lib/format.ts and in the email templates, and nowhere else.
 *
 * 2. FIRESTORE HAS NO JOINS, so names are denormalised onto the documents that
 *    display them (farmerName on a payment, unitCode on a batch). The write
 *    helpers in features/*\/queries.ts are responsible for keeping those copies
 *    honest — if you add a write path, copy the names there too.
 *
 * Timestamps are ISO-8601 strings rather than Firestore Timestamps. They sort
 * correctly as strings, survive JSON, and keep the UI free of conversions.
 */

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

/* -- Collections ----------------------------------------------------------- */

/** profiles/{uid} — the document id is the Firebase Auth uid. */
export interface Profile {
  id: string
  role: UserRole
  fullName: string
  email: string
  phone: string | null
  address: string | null
  avatarUrl: string | null
  status: AccountStatus
  createdAt: string
  updatedAt: string
}

/**
 * config/facility — readable by anyone signed in.
 *
 * The tariff lives here, and the climate thresholds deliberately do not: a
 * farmer needs the price and must never see the hardware settings. Firestore
 * rules work per document, so the split has to be at document level.
 */
export interface FacilityConfig {
  name: string
  location: string | null
  capacityKg: number
  timezone: string
  tariffKoboPerTonneMonth: number
  produce: string[]
  updatedAt: string
}

/** config/thresholds — ADMIN ONLY. Climate bands and alert routing. */
export interface ThresholdConfig {
  temperatureMinC: number
  temperatureMaxC: number
  /** Whole percentage points: the rig acts on integers. */
  humidityMinPct: number
  humidityMaxPct: number
  notifySms: boolean
  notifyWhatsapp: boolean
  notifyEmail: boolean
  alertPhone: string | null
  alertEmail: string | null
  updatedBy: string | null
  updatedAt: string
}

/**
 * config/conditions — readable by anyone signed in.
 *
 * The farmer-facing verdict, written by the sync route after it reads the
 * sensors. This exists so a farmer can be told "your produce is being kept
 * properly" without the app ever handing them a temperature. It carries no
 * numbers on purpose.
 */
export interface ConditionsDoc {
  verdict: "in_range" | "out_of_range" | "stale" | "unknown"
  checkedAt: string | null
}

/** storageUnits/{id} — cold rooms. Reference data, readable by all. */
export interface StorageUnit {
  id: string
  code: string
  name: string | null
  capacityKg: number
}

/** devices/{id} — ADMIN ONLY. The sensor rig and its last contact. */
export interface Device {
  id: string
  /** The node the rig writes in the Realtime Database (onionStorageId). */
  deviceId: string
  unitId: string
  unitCode: string
  online: boolean
  lastSeenAt: string | null
  /** The thresholds the rig is running, mirrored from the RTDB. Advisory. */
  thresholds: DeviceThresholds | null
}

export interface DeviceThresholds {
  highTempThreshold: number | null
  lowTempThreshold: number | null
  highHumThreshold: number | null
  lowHumThreshold: number | null
}

export interface Booking {
  id: string
  reference: string
  farmerId: string
  farmerName: string
  produce: string | null
  quantityKg: number
  months: number
  rateKobo: number
  amountKobo: number
  status: BookingStatus
  createdAt: string
  updatedAt: string
}

export interface StorageBatch {
  id: string
  reference: string
  farmerId: string
  farmerName: string
  farmerPhone: string | null
  unitId: string
  unitCode: string
  produce: string | null
  bookingId: string | null
  intakeKg: number
  availableKg: number
  storedAt: string
  expiresAt: string
  status: BatchStatus
  createdBy: string | null
  createdAt: string
  updatedAt: string
}

export interface WithdrawalRequest {
  id: string
  reference: string
  batchId: string
  batchReference: string
  farmerId: string
  farmerName: string
  quantityKg: number
  status: WithdrawalStatus
  note: string | null
  decidedBy: string | null
  decidedAt: string | null
  collectedAt: string | null
  createdAt: string
  updatedAt: string
}

/**
 * payments/{id}
 *
 * In Postgres `status` and `balanceKobo` were generated columns and could not
 * drift. Firestore has no such thing, so they are computed on every write by
 * `derivePayment` in lib/payments.ts. Never set them by hand.
 */
export interface Payment {
  id: string
  receiptNo: string
  farmerId: string
  farmerName: string
  farmerPhone: string | null
  batchId: string | null
  batchReference: string | null
  bookingId: string | null
  tonnes: number
  months: number
  rateKobo: number
  amountKobo: number
  paidKobo: number
  balanceKobo: number
  status: PaymentStatus
  method: PaymentMethod | null
  transactionRef: string | null
  recordedBy: string | null
  recordedByName: string | null
  paidAt: string | null
  createdAt: string
  updatedAt: string
}

/** sensorReadings/{id} — ADMIN ONLY. Append-only climate log. */
export interface SensorReading {
  id: string
  unitId: string
  unitCode: string
  temperatureC: number
  humidityPct: number
  batteryPct: number | null
  recordedAt: string
}

/** alerts/{id} — ADMIN ONLY. */
export interface Alert {
  id: string
  unitId: string | null
  unitCode: string | null
  type: AlertType
  severity: AlertSeverity
  status: AlertStatus
  title: string
  detail: string | null
  raisedAt: string
  acknowledgedBy: string | null
  acknowledgedAt: string | null
  resolvedAt: string | null
}

/** notifications/{id} — each person reads only their own. */
export interface AppNotification {
  id: string
  recipientId: string
  category: NotificationCategory
  title: string
  body: string | null
  link: string | null
  readAt: string | null
  createdAt: string
}

/** emailLog/{id} — ADMIN ONLY. Every transactional email, sent or failed. */
export interface EmailLogEntry {
  id: string
  recipientEmail: string
  recipientId: string | null
  template: string
  subject: string
  status: "queued" | "sent" | "failed"
  providerMessageId: string | null
  error: string | null
  createdAt: string
  sentAt: string | null
}

/* -- Collection names, in one place ---------------------------------------- */

export const COLLECTIONS = {
  profiles: "profiles",
  config: "config",
  storageUnits: "storageUnits",
  devices: "devices",
  bookings: "bookings",
  storageBatches: "storageBatches",
  withdrawalRequests: "withdrawalRequests",
  payments: "payments",
  sensorReadings: "sensorReadings",
  alerts: "alerts",
  notifications: "notifications",
  emailLog: "emailLog",
  counters: "counters",
} as const

export const CONFIG_DOCS = {
  facility: "facility",
  thresholds: "thresholds",
  conditions: "conditions",
} as const
