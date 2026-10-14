import {
  button,
  callout,
  codeBlock,
  dataTable,
  divider,
  figure,
  fineprint,
  heading,
  paragraph,
  shell,
  textVersion,
} from "./blocks.ts"

/** Kobo → "₦11,790". Money crosses the wire as an integer, always. */
const naira = (kobo: number) => `₦${Math.round(kobo / 100).toLocaleString("en-NG")}`
const kg = (value: number) => `${Math.round(value).toLocaleString("en-NG")} kg`
const day = (iso: string) =>
  new Date(iso).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })
const stamp = (iso: string) =>
  new Date(iso).toLocaleString("en-NG", {
    day: "numeric",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  })

const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? name

export interface RenderedEmail {
  subject: string
  html: string
  text: string
}

/**
 * Every transactional email the system sends. The key is what callers pass as
 * `template`; the payload shape is enforced at the call site by EmailPayloads.
 */
export interface EmailPayloads {
  welcome: { name: string; dashboardUrl: string }

  account_created: {
    name: string
    email: string
    setPasswordUrl: string
    facilityName: string
  }

  batch_stored: {
    name: string
    reference: string
    produce: string
    weightKg: number
    unitCode: string
    storedAt: string
    expiresAt: string
    batchUrl: string
  }

  booking_confirmed: {
    name: string
    reference: string
    produce: string
    quantityKg: number
    months: number
    amountKobo: number
    startsAt: string
    endsAt: string
  }

  payment_receipt: {
    name: string
    receiptNo: string
    batchReference: string | null
    tonnes: number
    months: number
    rateKobo: number
    amountKobo: number
    paidKobo: number
    balanceKobo: number
    method: string
    paidAt: string
    recordedBy: string
    receiptUrl: string
  }

  payment_reminder: {
    name: string
    receiptNo: string
    balanceKobo: number
    amountKobo: number
    dueOn: string
    payUrl: string
  }

  withdrawal_requested: {
    adminName: string
    farmerName: string
    reference: string
    batchReference: string
    quantityKg: number
    requestedAt: string
    reviewUrl: string
  }

  withdrawal_decided: {
    name: string
    reference: string
    batchReference: string
    quantityKg: number
    approved: boolean
    note: string | null
    dashboardUrl: string
  }

  withdrawal_collected: {
    name: string
    reference: string
    batchReference: string
    quantityKg: number
    remainingKg: number
    collectedAt: string
  }

  storage_expiring: {
    name: string
    reference: string
    produce: string
    availableKg: number
    expiresAt: string
    daysLeft: number
    renewUrl: string
  }

  storage_expired: {
    name: string
    reference: string
    availableKg: number
    expiredAt: string
    contactUrl: string
  }

  climate_alert: {
    adminName: string
    unitCode: string
    title: string
    detail: string
    severity: "warning" | "critical"
    raisedAt: string
    monitoringUrl: string
  }
}

export type TemplateName = keyof EmailPayloads

type Renderer = {
  [K in TemplateName]: (payload: EmailPayloads[K]) => RenderedEmail
}

export const templates: Renderer = {
  // --------------------------------------------------------------------------
  welcome: (p) => ({
    subject: "Your AgriVault account is ready",
    html: shell({
      title: "Welcome to AgriVault",
      preview: "Your account is verified. Here is what you can do next.",
      body: [
        heading(`Welcome, ${firstName(p.name)}`),
        paragraph(
          "Your email is verified and your account is live. From your dashboard you can follow every batch you have in storage, request a withdrawal, and settle storage fees.",
        ),
        button("Open my dashboard", p.dashboardUrl),
        divider(),
        paragraph(
          "Keep an eye on your storage end date — we will write to you a few days before it falls due so nothing is left unclaimed.",
          true,
        ),
      ].join(""),
    }),
    text: textVersion([
      `Welcome, ${firstName(p.name)}`,
      "",
      "Your email is verified and your account is live.",
      `Dashboard: ${p.dashboardUrl}`,
    ]),
  }),

  // --------------------------------------------------------------------------
  account_created: (p) => ({
    subject: `${p.facilityName} has set up your AgriVault account`,
    html: shell({
      title: "Your account has been created",
      preview: "Set a password to sign in for the first time.",
      body: [
        heading(`Hello, ${firstName(p.name)}`),
        paragraph(
          `${p.facilityName} has registered you on AgriVault so you can follow your produce in cold storage. Set a password to sign in for the first time.`,
        ),
        button("Set my password", p.setPasswordUrl),
        dataTable([
          { label: "Sign-in email", value: p.email, mono: true },
          { label: "Facility", value: p.facilityName },
        ]),
        callout(
          "This link is valid for 24 hours. After that, use “Forgot password” on the sign-in page.",
        ),
        fineprint(`If the button does not open, paste this into your browser: ${p.setPasswordUrl}`),
      ].join(""),
    }),
    text: textVersion([
      `Hello, ${firstName(p.name)}`,
      "",
      `${p.facilityName} has registered you on AgriVault.`,
      `Set your password: ${p.setPasswordUrl}`,
      `Sign-in email: ${p.email}`,
      "This link is valid for 24 hours.",
    ]),
  }),

  // --------------------------------------------------------------------------
  batch_stored: (p) => ({
    subject: `${p.reference} — ${kg(p.weightKg)} of ${p.produce} received`,
    html: shell({
      title: "Produce received into storage",
      preview: `${p.reference} is now in ${p.unitCode}.`,
      body: [
        heading("Your produce is in storage"),
        paragraph(
          `We have taken in ${kg(p.weightKg)} of ${p.produce} and tagged it ${p.reference}. The tag on your crate opens this record when scanned.`,
        ),
        dataTable([
          { label: "Storage ID", value: p.reference, mono: true },
          { label: "Produce", value: p.produce },
          { label: "Weight", value: kg(p.weightKg), mono: true },
          { label: "Cold room", value: p.unitCode, mono: true },
          { label: "Date in", value: day(p.storedAt) },
          { label: "Storage ends", value: day(p.expiresAt) },
        ]),
        button("View this batch", p.batchUrl),
      ].join(""),
    }),
    text: textVersion([
      "Your produce is in storage",
      "",
      `Storage ID: ${p.reference}`,
      `Produce: ${p.produce}`,
      `Weight: ${kg(p.weightKg)}`,
      `Cold room: ${p.unitCode}`,
      `Date in: ${day(p.storedAt)}`,
      `Storage ends: ${day(p.expiresAt)}`,
      "",
      p.batchUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  booking_confirmed: (p) => ({
    subject: `Booking ${p.reference} confirmed`,
    html: shell({
      title: "Booking confirmed",
      preview: `${kg(p.quantityKg)} of ${p.produce} for ${p.months} month(s).`,
      body: [
        heading("Your booking is confirmed"),
        paragraph(
          `Space is reserved for ${kg(p.quantityKg)} of ${p.produce}. Bring your produce to the facility any time from ${day(p.startsAt)}.`,
        ),
        dataTable([
          { label: "Booking", value: p.reference, mono: true },
          { label: "Produce", value: p.produce },
          { label: "Quantity", value: kg(p.quantityKg), mono: true },
          { label: "Duration", value: `${p.months} month${p.months > 1 ? "s" : ""}` },
          { label: "Storage period", value: `${day(p.startsAt)} – ${day(p.endsAt)}` },
        ]),
        figure("Amount paid", naira(p.amountKobo)),
      ].join(""),
    }),
    text: textVersion([
      "Your booking is confirmed",
      "",
      `Booking: ${p.reference}`,
      `Produce: ${p.produce}`,
      `Quantity: ${kg(p.quantityKg)}`,
      `Duration: ${p.months} month(s)`,
      `Period: ${day(p.startsAt)} – ${day(p.endsAt)}`,
      `Amount paid: ${naira(p.amountKobo)}`,
    ]),
  }),

  // --------------------------------------------------------------------------
  payment_receipt: (p) => ({
    subject: `Receipt ${p.receiptNo} — ${naira(p.paidKobo)} received`,
    html: shell({
      title: `Receipt ${p.receiptNo}`,
      preview: `We have received ${naira(p.paidKobo)}.`,
      body: [
        heading("Payment received"),
        paragraph(
          `Thank you, ${firstName(p.name)}. This is the official record of your payment${p.batchReference ? ` against ${p.batchReference}` : ""}.`,
        ),
        figure("Amount received", naira(p.paidKobo)),
        dataTable([
          { label: "Receipt no.", value: p.receiptNo, mono: true },
          { label: "Date", value: stamp(p.paidAt) },
          { label: "Method", value: p.method },
          ...(p.batchReference ? [{ label: "Batch", value: p.batchReference, mono: true }] : []),
          {
            label: "Basis",
            value: `${p.tonnes.toFixed(1)}t × ${p.months} mo × ${naira(p.rateKobo)}`,
            mono: true,
          },
          { label: "Total due", value: naira(p.amountKobo), mono: true },
          { label: "Balance after payment", value: naira(p.balanceKobo), mono: true },
        ]),
        p.balanceKobo > 0
          ? callout(`${naira(p.balanceKobo)} is still outstanding on this storage.`, "warn")
          : callout("This storage is fully settled.", "ok"),
        button("Download receipt", p.receiptUrl),
        fineprint(`Recorded by ${p.recordedBy}.`),
      ].join(""),
    }),
    text: textVersion([
      `Receipt ${p.receiptNo}`,
      "",
      `Amount received: ${naira(p.paidKobo)}`,
      `Date: ${stamp(p.paidAt)}`,
      `Method: ${p.method}`,
      p.batchReference ? `Batch: ${p.batchReference}` : null,
      `Basis: ${p.tonnes.toFixed(1)}t x ${p.months} mo x ${naira(p.rateKobo)}`,
      `Total due: ${naira(p.amountKobo)}`,
      `Balance after payment: ${naira(p.balanceKobo)}`,
      "",
      `Recorded by ${p.recordedBy}.`,
      p.receiptUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  payment_reminder: (p) => ({
    subject: `${naira(p.balanceKobo)} outstanding on ${p.receiptNo}`,
    html: shell({
      title: "Storage fee outstanding",
      preview: `${naira(p.balanceKobo)} is still due.`,
      body: [
        heading("A storage fee is still outstanding"),
        paragraph(
          `Hello ${firstName(p.name)} — our records show a balance on your storage account. Settling it keeps your produce in the cold room without interruption.`,
        ),
        figure("Outstanding balance", naira(p.balanceKobo)),
        dataTable([
          { label: "Receipt no.", value: p.receiptNo, mono: true },
          { label: "Total", value: naira(p.amountKobo), mono: true },
          { label: "Due by", value: day(p.dueOn) },
        ]),
        button("Settle this balance", p.payUrl),
        paragraph(
          "If you have already paid, no action is needed — this note and your payment may have crossed.",
          true,
        ),
      ].join(""),
    }),
    text: textVersion([
      "A storage fee is still outstanding",
      "",
      `Outstanding balance: ${naira(p.balanceKobo)}`,
      `Receipt no.: ${p.receiptNo}`,
      `Total: ${naira(p.amountKobo)}`,
      `Due by: ${day(p.dueOn)}`,
      "",
      p.payUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  withdrawal_requested: (p) => ({
    subject: `Withdrawal ${p.reference} — ${p.farmerName}, ${kg(p.quantityKg)}`,
    html: shell({
      title: "Withdrawal request awaiting review",
      preview: `${p.farmerName} has asked for ${kg(p.quantityKg)}.`,
      body: [
        heading("A withdrawal is waiting on you"),
        paragraph(`${p.farmerName} has requested a release from ${p.batchReference}.`),
        dataTable([
          { label: "Request", value: p.reference, mono: true },
          { label: "Farmer", value: p.farmerName },
          { label: "Batch", value: p.batchReference, mono: true },
          { label: "Quantity", value: kg(p.quantityKg), mono: true },
          { label: "Requested", value: stamp(p.requestedAt) },
        ]),
        button("Review the request", p.reviewUrl),
      ].join(""),
    }),
    text: textVersion([
      "A withdrawal is waiting on you",
      "",
      `Request: ${p.reference}`,
      `Farmer: ${p.farmerName}`,
      `Batch: ${p.batchReference}`,
      `Quantity: ${kg(p.quantityKg)}`,
      `Requested: ${stamp(p.requestedAt)}`,
      "",
      p.reviewUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  withdrawal_decided: (p) => ({
    subject: `Withdrawal ${p.reference} ${p.approved ? "approved" : "declined"}`,
    html: shell({
      title: `Withdrawal ${p.approved ? "approved" : "declined"}`,
      preview: `${kg(p.quantityKg)} from ${p.batchReference}.`,
      body: [
        heading(p.approved ? "Your withdrawal is approved" : "Your withdrawal was declined"),
        paragraph(
          p.approved
            ? `${kg(p.quantityKg)} from ${p.batchReference} is ready for collection. Bring your storage tag and a means of identification.`
            : `We were not able to release ${kg(p.quantityKg)} from ${p.batchReference} on this occasion.`,
        ),
        dataTable([
          { label: "Request", value: p.reference, mono: true },
          { label: "Batch", value: p.batchReference, mono: true },
          { label: "Quantity", value: kg(p.quantityKg), mono: true },
        ]),
        p.note ? callout(p.note, p.approved ? "ok" : "warn") : "",
        button("Open my dashboard", p.dashboardUrl),
      ].join(""),
    }),
    text: textVersion([
      p.approved ? "Your withdrawal is approved" : "Your withdrawal was declined",
      "",
      `Request: ${p.reference}`,
      `Batch: ${p.batchReference}`,
      `Quantity: ${kg(p.quantityKg)}`,
      p.note ? `Note: ${p.note}` : null,
      "",
      p.dashboardUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  withdrawal_collected: (p) => ({
    subject: `${kg(p.quantityKg)} collected from ${p.batchReference}`,
    html: shell({
      title: "Collection confirmed",
      preview: `${kg(p.remainingKg)} remains in storage.`,
      body: [
        heading("Collection confirmed"),
        paragraph(
          `${kg(p.quantityKg)} has been released to you from ${p.batchReference}. This is your record of the collection.`,
        ),
        dataTable([
          { label: "Request", value: p.reference, mono: true },
          { label: "Batch", value: p.batchReference, mono: true },
          { label: "Collected", value: kg(p.quantityKg), mono: true },
          { label: "Still in storage", value: kg(p.remainingKg), mono: true },
          { label: "Date", value: stamp(p.collectedAt) },
        ]),
        p.remainingKg === 0 ? callout("This batch is now empty and has been closed.", "ok") : "",
      ].join(""),
    }),
    text: textVersion([
      "Collection confirmed",
      "",
      `Request: ${p.reference}`,
      `Batch: ${p.batchReference}`,
      `Collected: ${kg(p.quantityKg)}`,
      `Still in storage: ${kg(p.remainingKg)}`,
      `Date: ${stamp(p.collectedAt)}`,
    ]),
  }),

  // --------------------------------------------------------------------------
  storage_expiring: (p) => ({
    subject: `${p.reference} — storage ends in ${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"}`,
    html: shell({
      title: "Storage period ending",
      preview: `${kg(p.availableKg)} of ${p.produce} is due for collection.`,
      body: [
        heading("Your storage period is ending"),
        paragraph(
          `${kg(p.availableKg)} of ${p.produce} under ${p.reference} reaches the end of its paid period on ${day(p.expiresAt)}. Collect it, or extend the storage, before then.`,
        ),
        callout(
          `${p.daysLeft} day${p.daysLeft === 1 ? "" : "s"} left.`,
          p.daysLeft <= 3 ? "critical" : "warn",
        ),
        dataTable([
          { label: "Storage ID", value: p.reference, mono: true },
          { label: "Produce", value: p.produce },
          { label: "In storage", value: kg(p.availableKg), mono: true },
          { label: "Ends on", value: day(p.expiresAt) },
        ]),
        button("Extend storage", p.renewUrl),
      ].join(""),
    }),
    text: textVersion([
      "Your storage period is ending",
      "",
      `Storage ID: ${p.reference}`,
      `Produce: ${p.produce}`,
      `In storage: ${kg(p.availableKg)}`,
      `Ends on: ${day(p.expiresAt)} (${p.daysLeft} day(s) left)`,
      "",
      p.renewUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  storage_expired: (p) => ({
    subject: `${p.reference} — storage period has ended`,
    html: shell({
      title: "Storage period ended",
      preview: `${kg(p.availableKg)} is awaiting collection.`,
      body: [
        heading("Your storage period has ended"),
        paragraph(
          `The paid period for ${p.reference} ended on ${day(p.expiredAt)} and ${kg(p.availableKg)} is still with us. Get in touch so we can arrange collection or extend the booking.`,
        ),
        callout(
          "Produce left beyond the paid period may attract additional charges and is held at the owner's risk.",
          "critical",
        ),
        dataTable([
          { label: "Storage ID", value: p.reference, mono: true },
          { label: "In storage", value: kg(p.availableKg), mono: true },
          { label: "Period ended", value: day(p.expiredAt) },
        ]),
        button("Contact the facility", p.contactUrl),
      ].join(""),
    }),
    text: textVersion([
      "Your storage period has ended",
      "",
      `Storage ID: ${p.reference}`,
      `In storage: ${kg(p.availableKg)}`,
      `Period ended: ${day(p.expiredAt)}`,
      "",
      p.contactUrl,
    ]),
  }),

  // --------------------------------------------------------------------------
  climate_alert: (p) => ({
    subject: `${p.severity === "critical" ? "Critical" : "Alert"}: ${p.title} in ${p.unitCode}`,
    html: shell({
      title: p.title,
      preview: p.detail,
      body: [
        heading(p.title),
        callout(p.detail, p.severity === "critical" ? "critical" : "warn"),
        dataTable([
          { label: "Cold room", value: p.unitCode, mono: true },
          { label: "Severity", value: p.severity === "critical" ? "Critical" : "Warning" },
          { label: "Raised", value: stamp(p.raisedAt) },
        ]),
        paragraph(
          "Readings outside the configured band put stored produce at risk. Check the room before clearing this alert.",
        ),
        button("Open monitoring", p.monitoringUrl),
      ].join(""),
    }),
    text: textVersion([
      p.title,
      "",
      p.detail,
      `Cold room: ${p.unitCode}`,
      `Severity: ${p.severity}`,
      `Raised: ${stamp(p.raisedAt)}`,
      "",
      p.monitoringUrl,
    ]),
  }),
}

/** Render by name with a payload the compiler has already checked. */
export function render<K extends TemplateName>(name: K, payload: EmailPayloads[K]): RenderedEmail {
  const renderer = templates[name] as (p: EmailPayloads[K]) => RenderedEmail
  return renderer(payload)
}

export const templateNames = Object.keys(templates) as TemplateName[]

/** Re-exported so the auth-template builder can share the same blocks. */
export { codeBlock }
