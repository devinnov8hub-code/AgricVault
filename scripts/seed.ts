/**
 * Seed the Firebase project.
 *
 *   npm run seed
 *
 * This is the Firebase answer to "do I need to run the migration files?" — no,
 * there are no migrations. Firestore creates collections the first time you
 * write to them, so this script IS the setup: it creates the accounts, the
 * facility configuration, the cold rooms, the device mapping and some demo
 * records, then stops.
 *
 * It is safe to run twice: everything is written with a fixed id or looked up
 * first, so a second run updates rather than duplicating.
 *
 * It needs FIREBASE_SERVICE_ACCOUNT in .env — the service-account JSON on one
 * line. That credential bypasses every security rule, so keep it out of git and
 * never give it the VITE_ prefix.
 *
 *   Admin    admin@agrivault.ng     AgriVault@2026
 *   Farmers  amina@agrivault.ng     Farmer@2026
 *            kelechi@agrivault.ng   Farmer@2026
 *            damilare@agrivault.ng  Farmer@2026
 *            mubarak@agrivault.ng   Farmer@2026
 *
 * CHANGE THOSE PASSWORDS BEFORE ANYONE ELSE CAN REACH THE APP.
 */

import { cert, initializeApp, type ServiceAccount } from "firebase-admin/app"
import { getAuth } from "firebase-admin/auth"
import { getFirestore } from "firebase-admin/firestore"

import { credentialHelp, findServiceAccount, loadEnv } from "./load-env.ts"

/* -- Environment ----------------------------------------------------------- */

const report = loadEnv()

let credential: ServiceAccount
let credentialSource: string

try {
  const found = findServiceAccount()
  credential = found.account
  credentialSource = found.source
} catch (cause) {
  const message = cause instanceof Error ? cause.message : String(cause)
  console.error("\n" + (message === "NO_CREDENTIAL" ? credentialHelp(report) : message) + "\n")
  process.exit(1)
}

console.log(`\nSeeding ${credential.projectId}`)
console.log(`Credential: ${credentialSource}`)
if (report.encodingNote) console.log(`.env: ${report.encodingNote}`)
console.log("")

initializeApp({ credential: cert(credential), databaseURL: process.env.FIREBASE_DB_URL })

const auth = getAuth()
const db = getFirestore()

const now = () => new Date().toISOString()
const daysFromNow = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString()
const daysAgo = (days: number) => new Date(Date.now() - days * 86_400_000).toISOString()

/* -- Accounts -------------------------------------------------------------- */

interface SeedUser {
  email: string
  password: string
  fullName: string
  role: "admin" | "farmer"
  phone: string
}

const USERS: SeedUser[] = [
  {
    email: "admin@agrivault.ng",
    password: "AgriVault@2026",
    fullName: "Patrick Smith",
    role: "admin",
    phone: "08030000001",
  },
  {
    email: "amina@agrivault.ng",
    password: "Farmer@2026",
    fullName: "Amina Bello",
    role: "farmer",
    phone: "08115846311",
  },
  {
    email: "kelechi@agrivault.ng",
    password: "Farmer@2026",
    fullName: "Kelechi Samuel",
    role: "farmer",
    phone: "08115846312",
  },
  {
    email: "damilare@agrivault.ng",
    password: "Farmer@2026",
    fullName: "Damilare Peter",
    role: "farmer",
    phone: "08115846313",
  },
  {
    email: "mubarak@agrivault.ng",
    password: "Farmer@2026",
    fullName: "Mubarak Yusuf",
    role: "farmer",
    phone: "08115846314",
  },
]

async function seedUser(user: SeedUser): Promise<string> {
  let uid: string

  try {
    const existing = await auth.getUserByEmail(user.email)
    uid = existing.uid
    await auth.updateUser(uid, {
      password: user.password,
      displayName: user.fullName,
      // Seeded accounts are confirmed in place so they can sign in at once.
      // Accounts that sign themselves up go through the real verification flow.
      emailVerified: true,
    })
  } catch {
    const created = await auth.createUser({
      email: user.email,
      password: user.password,
      displayName: user.fullName,
      emailVerified: true,
    })
    uid = created.uid
  }

  await db.collection("profiles").doc(uid).set(
    {
      role: user.role,
      fullName: user.fullName,
      email: user.email,
      phone: user.phone,
      address: null,
      avatarUrl: null,
      status: "active",
      createdAt: now(),
      updatedAt: now(),
    },
    { merge: true },
  )

  console.log(`  ${user.role.padEnd(6)} ${user.email}`)
  return uid
}

/* -- Run ------------------------------------------------------------------- */

console.log("Accounts")
const uids = new Map<string, string>()
for (const user of USERS) {
  uids.set(user.email, await seedUser(user))
}

const adminUid = uids.get("admin@agrivault.ng")!
const amina = uids.get("amina@agrivault.ng")!
const kelechi = uids.get("kelechi@agrivault.ng")!
const damilare = uids.get("damilare@agrivault.ng")!
const mubarak = uids.get("mubarak@agrivault.ng")!

console.log("\nFacility")

await db
  .collection("config")
  .doc("facility")
  .set(
    {
      name: "AgriVault Cold Store, Kano",
      location: "Dawanau Market, Kano State",
      capacityKg: 175000,
      timezone: "Africa/Lagos",
      // ₦15,000 per tonne per month, stored as kobo.
      tariffKoboPerTonneMonth: 1_500_000,
      produce: ["Onions", "Yam", "Tomatoes", "Sweet potatoes"],
      updatedAt: now(),
    },
    { merge: true },
  )
console.log("  config/facility")

await db.collection("config").doc("thresholds").set(
  {
    temperatureMinC: 7,
    temperatureMaxC: 13,
    // Whole percentage points: the rig acts on integers.
    humidityMinPct: 65,
    humidityMaxPct: 75,
    notifySms: true,
    notifyWhatsapp: true,
    notifyEmail: true,
    alertPhone: "08030000001",
    alertEmail: "alerts@agrivault.ng",
    updatedBy: adminUid,
    updatedAt: now(),
  },
  { merge: true },
)
console.log("  config/thresholds")

await db
  .collection("config")
  .doc("conditions")
  .set({ verdict: "unknown", checkedAt: null }, { merge: true })
console.log("  config/conditions")

const UNITS = [
  { id: "unit-1", code: "U-1", name: "Cold room 1", capacityKg: 60000 },
  { id: "unit-2", code: "U-2", name: "Cold room 2", capacityKg: 60000 },
  { id: "unit-3", code: "U-3", name: "Cold room 3", capacityKg: 55000 },
]

for (const unit of UNITS) {
  const { id, ...rest } = unit
  await db.collection("storageUnits").doc(id).set(rest, { merge: true })
}
console.log(`  ${UNITS.length} cold rooms`)

// device-id must match the node the rig writes in the Realtime Database
// (onionStorageId). Only store_001 exists on the pilot rig today.
await db.collection("devices").doc("store_001").set(
  {
    deviceId: "store_001",
    unitId: "unit-1",
    unitCode: "U-1",
    online: false,
    lastSeenAt: null,
    thresholds: null,
  },
  { merge: true },
)
console.log("  1 device (store_001 → U-1)")

console.log("\nCounters")
await db.collection("counters").doc("ST").set({ value: 500 }, { merge: true })
await db.collection("counters").doc("BK").set({ value: 30 }, { merge: true })
await db.collection("counters").doc("WD").set({ value: 20 }, { merge: true })
await db.collection("counters").doc("RC").set({ value: 110 }, { merge: true })
console.log("  ST, BK, WD, RC")

console.log("\nDemo records")

const BATCHES = [
  {
    id: "batch-0412",
    reference: "ST-0412",
    farmerId: amina,
    farmerName: "Amina Bello",
    farmerPhone: "08115846311",
    unitId: "unit-1",
    unitCode: "U-1",
    produce: "Onions",
    intakeKg: 3930,
    availableKg: 3930,
    storedAt: daysAgo(31),
    expiresAt: daysFromNow(29),
  },
  {
    id: "batch-0398",
    reference: "ST-0398",
    farmerId: kelechi,
    farmerName: "Kelechi Samuel",
    farmerPhone: "08115846312",
    unitId: "unit-1",
    unitCode: "U-1",
    produce: "Onions",
    intakeKg: 1570,
    availableKg: 1570,
    storedAt: daysAgo(23),
    expiresAt: daysFromNow(7),
  },
  {
    id: "batch-0456",
    reference: "ST-0456",
    farmerId: damilare,
    farmerName: "Damilare Peter",
    farmerPhone: "08115846313",
    unitId: "unit-2",
    unitCode: "U-2",
    produce: "Yam",
    intakeKg: 2055,
    availableKg: 2055,
    storedAt: daysAgo(15),
    expiresAt: daysFromNow(75),
  },
  {
    id: "batch-0377",
    reference: "ST-0377",
    farmerId: mubarak,
    farmerName: "Mubarak Yusuf",
    farmerPhone: "08115846314",
    unitId: "unit-2",
    unitCode: "U-2",
    produce: "Onions",
    intakeKg: 3240,
    availableKg: 3240,
    storedAt: daysAgo(30),
    expiresAt: daysFromNow(3),
  },
]

for (const batch of BATCHES) {
  const { id, ...rest } = batch
  await db
    .collection("storageBatches")
    .doc(id)
    .set(
      {
        ...rest,
        bookingId: null,
        status: "stored",
        createdBy: adminUid,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true },
    )
}
console.log(`  ${BATCHES.length} storage batches`)

/** Status and balance are derived, exactly as the app does on every write. */
function derive(amountKobo: number, paidKobo: number) {
  const amount = Math.round(amountKobo)
  const paid = Math.min(amount, Math.round(paidKobo))
  return {
    amountKobo: amount,
    paidKobo: paid,
    balanceKobo: amount - paid,
    status: paid >= amount ? "paid" : paid > 0 ? "part_paid" : "due",
  }
}

const PAYMENTS = [
  {
    id: "pay-0101",
    receiptNo: "RC-0101",
    farmerId: amina,
    farmerName: "Amina Bello",
    farmerPhone: "08115846311",
    batchId: "batch-0412",
    batchReference: "ST-0412",
    tonnes: 3.93,
    months: 2,
    amount: 11_790_000,
    paid: 11_790_000,
    method: "transfer",
    transactionRef: "TRF-8831204",
    paidAt: daysAgo(8),
  },
  {
    id: "pay-0102",
    receiptNo: "RC-0102",
    farmerId: kelechi,
    farmerName: "Kelechi Samuel",
    farmerPhone: "08115846312",
    batchId: "batch-0398",
    batchReference: "ST-0398",
    tonnes: 1.57,
    months: 1,
    amount: 2_355_000,
    paid: 900_000,
    method: "cash",
    transactionRef: null,
    paidAt: daysAgo(11),
  },
  {
    id: "pay-0103",
    receiptNo: "RC-0103",
    farmerId: damilare,
    farmerName: "Damilare Peter",
    farmerPhone: "08115846313",
    batchId: "batch-0456",
    batchReference: "ST-0456",
    tonnes: 2.055,
    months: 3,
    amount: 9_247_500,
    paid: 0,
    method: null,
    transactionRef: null,
    paidAt: null,
  },
  {
    id: "pay-0104",
    receiptNo: "RC-0104",
    farmerId: mubarak,
    farmerName: "Mubarak Yusuf",
    farmerPhone: "08115846314",
    batchId: "batch-0377",
    batchReference: "ST-0377",
    tonnes: 3.24,
    months: 1,
    amount: 4_860_000,
    paid: 4_860_000,
    method: "pos",
    transactionRef: "POS-5520914",
    paidAt: daysAgo(30),
  },
]

for (const payment of PAYMENTS) {
  const { id, amount, paid, ...rest } = payment
  await db
    .collection("payments")
    .doc(id)
    .set(
      {
        ...rest,
        bookingId: null,
        rateKobo: 1_500_000,
        ...derive(amount, paid),
        recordedBy: adminUid,
        recordedByName: "Patrick Smith",
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true },
    )
}
console.log(`  ${PAYMENTS.length} payments`)

const WITHDRAWALS = [
  {
    id: "wd-0001",
    reference: "WD-0001",
    batchId: "batch-0412",
    batchReference: "ST-0412",
    farmerId: amina,
    farmerName: "Amina Bello",
    quantityKg: 500,
    status: "pending",
    decidedAt: null,
  },
  {
    id: "wd-0002",
    reference: "WD-0002",
    batchId: "batch-0398",
    batchReference: "ST-0398",
    farmerId: kelechi,
    farmerName: "Kelechi Samuel",
    quantityKg: 200,
    status: "pending",
    decidedAt: null,
  },
  {
    id: "wd-0003",
    reference: "WD-0003",
    batchId: "batch-0377",
    batchReference: "ST-0377",
    farmerId: mubarak,
    farmerName: "Mubarak Yusuf",
    quantityKg: 300,
    status: "approved",
    decidedAt: daysAgo(1),
  },
]

for (const request of WITHDRAWALS) {
  const { id, ...rest } = request
  await db
    .collection("withdrawalRequests")
    .doc(id)
    .set(
      {
        ...rest,
        note: null,
        decidedBy: rest.status === "pending" ? null : adminUid,
        collectedAt: null,
        createdAt: now(),
        updatedAt: now(),
      },
      { merge: true },
    )
}
console.log(`  ${WITHDRAWALS.length} withdrawal requests`)

console.log(`
Done.

  Admin    admin@agrivault.ng / AgriVault@2026
  Farmer   amina@agrivault.ng / Farmer@2026

Next:
  1. firebase deploy --only firestore:rules,firestore:indexes,database
  2. npm run dev

CHANGE THE SEEDED PASSWORDS before anyone else can reach the app.
`)

process.exit(0)
