import { useMemo, useState } from "react"

import { farmerNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { PaymentBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card"
import { Field, Input, Select } from "@/components/ui/field"
import { DataTable, EmptyState, Pagination, type Column } from "@/components/ui/table"
import { useFacility, useProduceTypes } from "@/features/facility/queries"
import { useAuth } from "@/features/auth/auth-context"
import { PAGE_SIZE, useMyPayments } from "@/features/payments/queries"
import { downloadReceipt } from "@/features/payments/receipt"
import { date, naira } from "@/lib/format"
import type { Payment } from "@/types/models"

const DURATIONS = [1, 2, 3, 6, 12].map((months) => ({
  value: months,
  label: `${months} month${months > 1 ? "s" : ""}`,
}))

const METHODS = [
  { value: "transfer", label: "Bank transfer" },
  { value: "card", label: "Card" },
  { value: "ussd", label: "USSD" },
]

export default function FarmerPaymentsPage() {
  const { profile } = useAuth()
  const { data: facility } = useFacility()
  const produce = useProduceTypes()

  const rateKobo = facility?.tariffKoboPerTonneMonth ?? 0

  const [quantityKg, setQuantityKg] = useState("2000")
  const [months, setMonths] = useState(2)
  const [produceName, setProduceName] = useState("")
  const [method, setMethod] = useState("transfer")
  const [page, setPage] = useState(1)

  const { data, isLoading } = useMyPayments(profile?.id, page)

  const tonnes = (Number(quantityKg) || 0) / 1000
  const totalKobo = Math.round(tonnes * rateKobo * months)

  const endsOn = useMemo(() => {
    const end = new Date()
    end.setMonth(end.getMonth() + months)
    return end
  }, [months])

  const outstandingKobo = (data?.rows ?? []).reduce((sum, row) => sum + row.balanceKobo, 0)
  const paidKobo = (data?.rows ?? []).reduce((sum, row) => sum + row.paidKobo, 0)

  const columns: Array<Column<Payment>> = [
    {
      key: "receipt",
      header: "Receipt",
      render: (row) => <span className="mono text-xs font-medium">{row.receiptNo}</span>,
    },
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
    { key: "date", header: "Date", render: (row) => (row.paidAt ? date(row.paidAt) : "—") },
    { key: "status", header: "Status", render: (row) => <PaymentBadge status={row.status} /> },
    {
      key: "receiptAction",
      header: "",
      render: (row) =>
        row.paidKobo > 0 ? (
          <Button
            variant="outline"
            size="sm"
            icon="download"
            onClick={() => void downloadReceipt(row)}
          >
            Receipt
          </Button>
        ) : null,
    },
  ]

  return (
    <AppShell
      nav={farmerNav}
      title="Storage payment"
      subtitle="Choose how long to store your produce, then pay"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Stat label="Paid to date" value={naira(paidKobo)} icon="savings" />
        <Stat label="Outstanding" value={naira(outstandingKobo)} icon="pending_actions" />
      </div>

      <div className="grid gap-4 xl:grid-cols-2">
        <Card>
          <CardHeader
            icon="inventory_2"
            title="Storage details"
            description="Tell us what you are bringing in."
          />
          <CardBody className="flex flex-col gap-4">
            <Field label="Produce">
              {(props) => (
                <Select
                  {...props}
                  value={produceName}
                  onChange={(event) => setProduceName(event.target.value)}
                  options={[
                    { value: "", label: "Select produce" },
                    ...produce.map((item) => ({ value: item, label: item })),
                  ]}
                />
              )}
            </Field>

            <Field label="Quantity">
              {(props) => (
                <Input
                  {...props}
                  type="number"
                  min={1}
                  numeric
                  suffix="kg"
                  value={quantityKg}
                  onChange={(event) => setQuantityKg(event.target.value)}
                />
              )}
            </Field>

            <Field label="Duration">
              {(props) => (
                <Select
                  {...props}
                  value={months}
                  onChange={(event) => setMonths(Number(event.target.value))}
                  options={DURATIONS}
                />
              )}
            </Field>

            <Field label="Payment method">
              {(props) => (
                <Select
                  {...props}
                  value={method}
                  onChange={(event) => setMethod(event.target.value)}
                  options={METHODS}
                />
              )}
            </Field>
          </CardBody>
        </Card>

        <Card className="flex flex-col">
          <CardHeader icon="receipt_long" title="Summary" />
          <CardBody className="flex flex-1 flex-col gap-4">
            <dl className="flex flex-col gap-3">
              <Row label="Quantity" value={`${tonnes.toFixed(1)}t`} />
              <Row label="Duration" value={`${months} month${months > 1 ? "s" : ""}`} />
              <Row label="Rate" value={`${naira(rateKobo)} / t / month`} />
              <Row label="Storage ends" value={date(endsOn)} />
            </dl>

            <div className="mt-auto rounded-lg bg-brand-50 p-4">
              <p className="text-xs text-brand-600">Total to pay</p>
              <p className="mono pt-1 text-2xl font-semibold text-brand-800">{naira(totalKobo)}</p>
            </div>

            <Button size="lg" block disabled={tonnes <= 0 || !produceName || rateKobo === 0}>
              Pay {naira(totalKobo)}
            </Button>
            <p className="text-center text-2xs text-ink-subtle">
              You will receive a receipt by email once payment clears.
            </p>
          </CardBody>
        </Card>
      </div>

      <Card>
        <CardHeader title="Payment history" />
        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={
            <EmptyState
              title="No payments yet"
              description="Receipts appear here after your first storage payment."
              icon="receipt_long"
            />
          }
        />
        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          noun="payments"
          onChange={setPage}
        />
      </Card>
    </AppShell>
  )
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-line pb-3 last:border-0 last:pb-0">
      <dt className="text-xs text-ink-muted">{label}</dt>
      <dd className="mono text-sm font-medium">{value}</dd>
    </div>
  )
}
