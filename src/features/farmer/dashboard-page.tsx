import { useState } from "react"

import { farmerNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { BatchBadge, WithdrawalBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader, Stat } from "@/components/ui/card"
import { Field, Input, Select } from "@/components/ui/field"
import { Modal } from "@/components/ui/modal"
import { EmptyState } from "@/components/ui/table"
import { useAuth } from "@/features/auth/auth-context"
import { useMyBatches } from "@/features/inventory/queries"
import { useStorageConditions } from "@/features/facility/queries"
import { QrTagModal } from "@/features/inventory/qr-tag-modal"
import { Icon } from "@/components/ui/icon"
import { useMyWithdrawals, useRequestWithdrawal } from "@/features/withdrawals/queries"
import { cn } from "@/lib/cn"
import { date, dateShort, daysUntil, kilograms, relativeDateTime, tonnes } from "@/lib/format"
import { toMessage } from "@/lib/firebase"
import type { ConditionsDoc, StorageBatch } from "@/types/models"

export default function FarmerDashboardPage() {
  const { profile } = useAuth()

  const { data: batches = [], isLoading } = useMyBatches(profile?.id)
  const { data: withdrawals = [] } = useMyWithdrawals(profile?.id)
  const { data: conditions } = useStorageConditions(batches.length > 0)

  const [tagged, setTagged] = useState<StorageBatch | null>(null)
  const [withdrawing, setWithdrawing] = useState<StorageBatch | null>(null)

  const storedKg = batches.reduce((sum, batch) => sum + Number(batch.availableKg), 0)
  const soonest = batches.reduce<StorageBatch | null>(
    (earliest, batch) =>
      !earliest || new Date(batch.expiresAt) < new Date(earliest.expiresAt) ? batch : earliest,
    null,
  )

  const firstName = profile?.fullName.split(/\s+/)[0] ?? "there"

  return (
    <AppShell
      nav={farmerNav}
      title={`Hello, ${firstName}`}
      subtitle="Your stored produce at a glance"
    >
      {batches.length > 0 && conditions && <ConditionsBanner conditions={conditions} />}

      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="Batches in storage" value={String(batches.length)} icon="inventory_2" />
        <Stat label="Total stored" value={tonnes(storedKg)} icon="scale" />
        <Stat
          label="Next storage ends"
          value={
            soonest
              ? daysUntil(soonest.expiresAt) <= 0
                ? "Overdue"
                : `${daysUntil(soonest.expiresAt)} days`
              : "—"
          }
          hint={soonest ? dateShort(soonest.expiresAt) : undefined}
          icon="schedule"
        />
      </div>

      <Card>
        <CardHeader title="Your storage" description="Everything currently with the facility" />
        <CardBody className="p-0">
          {isLoading ? (
            <div className="p-4 text-xs text-ink-muted">Loading…</div>
          ) : batches.length === 0 ? (
            <EmptyState
              title="Nothing in storage"
              description="Batches appear here once the facility takes in your produce."
              icon="inventory"
            />
          ) : (
            <ul>
              {batches.map((batch) => (
                <li key={batch.id} className="border-b border-line p-4 last:border-0">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div className="min-w-0">
                      <div className="flex items-center gap-3">
                        <span className="mono text-sm font-semibold">{batch.reference}</span>
                        <BatchBadge status={batch.status} />
                      </div>
                      <p className="pt-1 text-xs text-ink-muted">
                        {batch.produce ?? "Produce"} · {batch.unitCode} · in{" "}
                        {dateShort(batch.storedAt)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        icon="qr_code_2"
                        onClick={() => setTagged(batch)}
                      >
                        Tag
                      </Button>
                      <Button
                        size="sm"
                        icon="outbox"
                        disabled={Number(batch.availableKg) <= 0}
                        onClick={() => setWithdrawing(batch)}
                      >
                        Withdraw
                      </Button>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-6 pt-4">
                    <Metric label="Available" value={kilograms(batch.availableKg)} />
                    <Metric label="Taken in" value={kilograms(batch.intakeKg)} />
                    <Metric
                      label="Ends"
                      value={date(batch.expiresAt)}
                      tone={daysUntil(batch.expiresAt) <= 3 ? "critical" : undefined}
                    />
                    <Metric
                      label="Days left"
                      value={
                        daysUntil(batch.expiresAt) <= 0
                          ? "Overdue"
                          : String(daysUntil(batch.expiresAt))
                      }
                      tone={daysUntil(batch.expiresAt) <= 3 ? "critical" : undefined}
                    />
                  </div>

                  <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-neutral-200">
                    <div
                      className={cn(
                        "h-full rounded-full",
                        daysUntil(batch.expiresAt) <= 3 ? "bg-critical" : "bg-brand-600",
                      )}
                      style={{
                        width: `${Math.min(100, Math.max(0, (Number(batch.availableKg) / Number(batch.intakeKg)) * 100))}%`,
                      }}
                    />
                  </div>
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <Card>
        <CardHeader title="Withdrawal requests" description="What you have asked to collect" />
        <CardBody className="p-0">
          {withdrawals.length === 0 ? (
            <EmptyState title="No requests yet" icon="outbox" />
          ) : (
            <ul>
              {withdrawals.map((request) => (
                <li
                  key={request.id}
                  className="flex items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
                >
                  <div className="min-w-0">
                    <p className="mono text-sm">{request.reference}</p>
                    <p className="mono text-2xs text-ink-subtle">
                      {request.batchReference} · {kilograms(request.quantityKg)}
                    </p>
                  </div>
                  <WithdrawalBadge status={request.status} />
                </li>
              ))}
            </ul>
          )}
        </CardBody>
      </Card>

      <QrTagModal batch={tagged} onClose={() => setTagged(null)} />
      <WithdrawalModal
        batch={withdrawing}
        farmerId={profile?.id ?? ""}
        farmerName={profile?.fullName ?? ""}
        onClose={() => setWithdrawing(null)}
      />
    </AppShell>
  )
}

/**
 * The farmer's view of storage conditions.
 *
 * Deliberately qualitative. Sensor values, thresholds and alerts belong to the
 * facility, and the database will not serve them to a farmer at all. What the
 * service actually promises is "your produce is being kept properly", so that
 * is what this says — the same wording as the storage-record SMS.
 */
function ConditionsBanner({ conditions }: { conditions: ConditionsDoc }) {
  const look = {
    in_range: {
      tone: "bg-ok-soft text-ok",
      icon: "verified",
      text: "Your produce is being held within the facility's operating range.",
    },
    out_of_range: {
      tone: "bg-warn-soft text-warn",
      icon: "info",
      text: "The facility is working on conditions in your storage room. Your record is unaffected.",
    },
    stale: {
      tone: "bg-neutral-100 text-ink-muted",
      icon: "schedule",
      text: "Awaiting the facility's latest conditions check.",
    },
    unknown: {
      tone: "bg-neutral-100 text-ink-muted",
      icon: "schedule",
      text: "Conditions will appear here once the facility's next check is in.",
    },
  }[conditions.verdict]

  return (
    <div className={cn("flex items-start gap-3 rounded-lg px-4 py-3", look.tone)}>
      <Icon name={look.icon} className="shrink-0 text-base" />
      <div className="min-w-0">
        <p className="text-sm font-medium">{look.text}</p>
        {conditions.checkedAt && (
          <p className="pt-1 text-xs opacity-80">
            Last checked {relativeDateTime(conditions.checkedAt)}
          </p>
        )}
      </div>
    </div>
  )
}

function Metric({ label, value, tone }: { label: string; value: string; tone?: "critical" }) {
  return (
    <div>
      <p className="text-2xs text-ink-muted">{label}</p>
      <p className={cn("mono pt-1 text-sm font-medium", tone === "critical" && "text-critical")}>
        {value}
      </p>
    </div>
  )
}

/* -------------------------------------------------------------------------- */

function WithdrawalModal({
  batch,
  farmerId,
  farmerName,
  onClose,
}: {
  batch: StorageBatch | null
  farmerId: string
  farmerName: string
  onClose: () => void
}) {
  const request = useRequestWithdrawal()

  const [collection, setCollection] = useState<"partial" | "full">("partial")
  const [quantity, setQuantity] = useState("")
  const [error, setError] = useState<string | null>(null)

  if (!batch) return null

  const available = Number(batch.availableKg)
  const kg = collection === "full" ? available : Number(quantity)
  const valid = kg > 0 && kg <= available

  async function handleSubmit() {
    if (!batch || !valid) {
      setError(`Enter a quantity between 1 and ${Math.floor(available)} kg.`)
      return
    }

    setError(null)
    try {
      await request.mutateAsync({ batch, farmerId, farmerName, quantityKg: kg })
      setQuantity("")
      setCollection("partial")
      onClose()
    } catch (cause) {
      setError(toMessage(cause))
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={`Request withdrawal · ${batch.reference}`}
      description={`${kilograms(available)} available`}
      size="sm"
      footer={
        <>
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button loading={request.isPending} onClick={() => void handleSubmit()}>
            Submit request
          </Button>
        </>
      }
    >
      <div className="flex flex-col gap-4">
        <Field label="Collection">
          {(props) => (
            <Select
              {...props}
              value={collection}
              onChange={(event) => {
                setCollection(event.target.value as "partial" | "full")
                setError(null)
              }}
              options={[
                { value: "partial", label: "Part of this batch" },
                { value: "full", label: "Everything available" },
              ]}
            />
          )}
        </Field>

        <Field
          label="Quantity"
          hint="The facility reviews your request before collection."
          error={error ?? undefined}
        >
          {(props) => (
            <Input
              {...props}
              type="number"
              min={1}
              max={available}
              numeric
              suffix="kg"
              disabled={collection === "full"}
              value={collection === "full" ? String(Math.floor(available)) : quantity}
              onChange={(event) => {
                setQuantity(event.target.value)
                setError(null)
              }}
            />
          )}
        </Field>
      </div>
    </Modal>
  )
}
