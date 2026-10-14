import { useState } from "react"

import { adminNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { PaymentBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, Stat } from "@/components/ui/card"
import { Field, Input, Select } from "@/components/ui/field"
import { Modal } from "@/components/ui/modal"
import { DataTable, EmptyState, Pagination, type Column } from "@/components/ui/table"
import { useAuth } from "@/features/auth/auth-context"
import {
  PAGE_SIZE,
  useRecordPayment,
  usePaymentTotals,
  usePayments,
  type DateRange,
} from "@/features/payments/queries"
import { downloadReceipt } from "@/features/payments/receipt"
import { date, naira, toKobo } from "@/lib/format"
import { toMessage } from "@/lib/firebase"
import type { Payment, PaymentMethod, PaymentStatus } from "@/types/models"

const STATUSES = [
  { value: "all", label: "All statuses" },
  { value: "paid", label: "Paid" },
  { value: "part_paid", label: "Part-paid" },
  { value: "due", label: "Due" },
]

const RANGES = [
  { value: "all", label: "All time" },
  { value: "month", label: "This month" },
  { value: "30", label: "Last 30 days" },
]

const METHODS = [
  { value: "transfer", label: "Bank transfer" },
  { value: "cash", label: "Cash" },
  { value: "pos", label: "POS" },
  { value: "card", label: "Card" },
  { value: "ussd", label: "USSD" },
]

function toCsv(rows: Payment[]) {
  const header = [
    "Receipt",
    "Farmer",
    "Batch",
    "Tonnes",
    "Months",
    "Amount",
    "Paid",
    "Balance",
    "Method",
    "Date",
    "Status",
  ]

  const body = rows.map((row) =>
    [
      row.receiptNo,
      row.farmerName,
      row.batchReference ?? "",
      row.tonnes,
      row.months,
      row.amountKobo / 100,
      row.paidKobo / 100,
      row.balanceKobo / 100,
      row.method ?? "",
      row.paidAt ?? "",
      row.status,
    ]
      .map((value) => `"${String(value).replace(/"/g, '""')}"`)
      .join(","),
  )

  const blob = new Blob([[header.join(","), ...body].join("\n")], {
    type: "text/csv;charset=utf-8",
  })
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")
  link.href = url
  link.download = `payments-${new Date().toISOString().slice(0, 10)}.csv`
  link.click()
  URL.revokeObjectURL(url)
}

export default function AdminPaymentsPage() {
  const { profile } = useAuth()

  const [search, setSearch] = useState("")
  const [status, setStatus] = useState<PaymentStatus | "all">("all")
  const [range, setRange] = useState<DateRange>("all")
  const [page, setPage] = useState(1)
  const [recording, setRecording] = useState<Payment | null>(null)

  const { data, isLoading } = usePayments({ search, status, range, page })
  const { data: totals } = usePaymentTotals()

  const columns: Array<Column<Payment>> = [
    {
      key: "receipt",
      header: "Receipt",
      render: (row) => <span className="mono text-xs font-medium">{row.receiptNo}</span>,
    },
    { key: "farmer", header: "Farmer", render: (row) => row.farmerName },
    {
      key: "batch",
      header: "Batch",
      render: (row) => <span className="mono text-xs">{row.batchReference ?? "—"}</span>,
    },
    {
      key: "basis",
      header: "Basis",
      numeric: true,
      render: (row) => `${row.tonnes.toFixed(1)}t × ${row.months}mo`,
    },
    { key: "amount", header: "Amount", numeric: true, render: (row) => naira(row.amountKobo) },
    { key: "paid", header: "Paid", numeric: true, render: (row) => naira(row.paidKobo) },
    {
      key: "balance",
      header: "Balance",
      numeric: true,
      render: (row) => (
        <span className={row.balanceKobo > 0 ? "text-critical" : undefined}>
          {naira(row.balanceKobo)}
        </span>
      ),
    },
    {
      key: "date",
      header: "Date",
      render: (row) => (row.paidAt ? date(row.paidAt) : "—"),
    },
    { key: "status", header: "Status", render: (row) => <PaymentBadge status={row.status} /> },
    {
      key: "action",
      header: "",
      render: (row) =>
        row.status === "paid" ? (
          <Button
            variant="outline"
            size="sm"
            icon="download"
            onClick={() => void downloadReceipt(row)}
          >
            Receipt
          </Button>
        ) : (
          <Button size="sm" onClick={() => setRecording(row)}>
            Record payment
          </Button>
        ),
    },
  ]

  return (
    <AppShell
      nav={adminNav}
      title="Payments"
      subtitle="Storage fees and receipts"
      action={
        <Button
          variant="outline"
          icon="download"
          onClick={() => toCsv(data?.rows ?? [])}
          disabled={!data?.rows.length}
        >
          Export CSV
        </Button>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Total collected" value={naira(totals?.collectedKobo ?? 0)} icon="savings" />
        <Stat
          label="Outstanding"
          value={naira(totals?.outstandingKobo ?? 0)}
          icon="pending_actions"
        />
        <Stat label="This month" value={naira(totals?.monthKobo ?? 0)} icon="calendar_month" />
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="w-full max-w-xs">
            <Input
              icon="search"
              placeholder="Search receipt, farmer or batch…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
          <div className="w-40">
            <Select
              aria-label="Status"
              value={status}
              onChange={(event) => {
                setStatus(event.target.value as PaymentStatus | "all")
                setPage(1)
              }}
              options={STATUSES}
            />
          </div>
          <div className="w-40">
            <Select
              aria-label="Date range"
              value={range}
              onChange={(event) => {
                setRange(event.target.value as DateRange)
                setPage(1)
              }}
              options={RANGES}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={<EmptyState title="No payments match these filters" icon="receipt_long" />}
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          noun="payments"
          onChange={setPage}
        />
      </Card>

      <RecordPaymentModal
        payment={recording}
        recordedBy={profile?.id ?? ""}
        recordedByName={profile?.fullName ?? "—"}
        onClose={() => setRecording(null)}
      />
    </AppShell>
  )
}

/* -------------------------------------------------------------------------- */

function RecordPaymentModal({
  payment,
  recordedBy,
  recordedByName,
  onClose,
}: {
  payment: Payment | null
  recordedBy: string
  recordedByName: string
  onClose: () => void
}) {
  const record = useRecordPayment()

  const [amount, setAmount] = useState("")
  const [method, setMethod] = useState<PaymentMethod>("transfer")
  const [reference, setReference] = useState("")
  const [error, setError] = useState<string | null>(null)

  if (!payment) return null

  const outstanding = payment.balanceKobo / 100
  const entered = Number(amount)
  const valid = entered > 0 && entered <= outstanding

  async function handleSubmit() {
    if (!payment || !valid) {
      setError(`Enter an amount between ₦1 and ${naira(payment?.balanceKobo ?? 0)}.`)
      return
    }

    setError(null)
    try {
      await record.mutateAsync({
        paymentId: payment.id,
        addKobo: toKobo(entered),
        method,
        transactionRef: reference.trim() || undefined,
        recordedBy,
        recordedByName,
      })
      setAmount("")
      setReference("")
      onClose()
    } catch (cause) {
      setError(toMessage(cause))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Record payment · ${payment.receiptNo}`}
      description={`${payment.farmerName} — ${naira(payment.balanceKobo)} outstanding`}
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={record.isPending} onClick={() => void handleSubmit()}>
            Record payment
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field
          label="Amount received"
          hint={`Up to ${naira(payment.balanceKobo)}`}
          error={error ?? undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={outstanding}
              numeric
              placeholder="0"
              value={amount}
              onChange={(event) => {
                setAmount(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>

        <Field label="Method">
          {(props) => (
            <Select
              {...props}
              value={method}
              onChange={(event) => setMethod(event.target.value as PaymentMethod)}
              options={METHODS}
            />
          )}
        </Field>

        <Field label="Transaction reference" hint="Optional — the bank or POS reference.">
          {(props) => (
            <Input
              {...props}
              numeric
              placeholder="TRF-…"
              value={reference}
              onChange={(event) => setReference(event.target.value)}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
