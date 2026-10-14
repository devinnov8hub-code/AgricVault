import { dateTime } from "@/lib/format"
import type { Payment } from "@/types/models"

/** jsPDF's built-in fonts have no ₦ glyph, so the PDF says NGN. */
const ngn = (kobo: number) => `NGN ${Math.round(kobo / 100).toLocaleString("en-NG")}`

const METHOD: Record<string, string> = {
  cash: "Cash",
  transfer: "Bank transfer",
  pos: "POS",
  card: "Card",
  ussd: "USSD",
}

/**
 * jsPDF and its canvas dependencies weigh more than the rest of the page put
 * together, so they are fetched only when someone actually asks for a receipt.
 */
export async function downloadReceipt(payment: Payment) {
  const { jsPDF } = await import("jspdf")

  const doc = new jsPDF({ unit: "pt", format: "a5" })
  const left = 40
  const right = 380
  let y = 56

  const row = (label: string, value: string, strong = false) => {
    doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(113, 113, 125)
    doc.text(label, left, y)
    doc
      .setFont("helvetica", strong ? "bold" : "normal")
      .setFontSize(10)
      .setTextColor(24, 24, 28)
    doc.text(value, right, y, { align: "right" })
    y += 22
  }

  const rule = () => {
    doc.setDrawColor(232, 232, 236).line(left, y, right, y)
    y += 20
  }

  doc.setFont("helvetica", "bold").setFontSize(16).setTextColor(106, 58, 140)
  doc.text("AgriVault", left, y)
  y += 20

  doc.setFont("helvetica", "bold").setFontSize(18).setTextColor(24, 24, 28)
  doc.text("Receipt", left, y)
  y += 16

  doc.setFont("helvetica", "normal").setFontSize(9).setTextColor(113, 113, 125)
  doc.text("Official record of this storage payment", left, y)
  y += 32

  row("Receipt no.", payment.receiptNo)
  row("Date", payment.paidAt ? dateTime(payment.paidAt) : "Not yet paid")
  row("Method", payment.method ? (METHOD[payment.method] ?? payment.method) : "—")
  row("Paid by", payment.farmerName)
  row("Phone", payment.farmerPhone ?? "—")
  row("Batch", payment.batchReference ?? "—")
  if (payment.transactionRef) row("Transaction ref.", payment.transactionRef)

  rule()

  row(
    `Storage · ${payment.tonnes.toFixed(1)}t x ${payment.months} mo x ${ngn(payment.rateKobo)}`,
    ngn(payment.amountKobo),
  )
  row("Amount paid", ngn(payment.paidKobo), true)
  row("Balance", ngn(payment.balanceKobo))

  y += 8
  doc.setFontSize(8).setTextColor(161, 161, 172)
  doc.text(`Recorded by ${payment.recordedByName ?? "—"}`, left, y)

  doc.save(`${payment.receiptNo}.pdf`)
}
