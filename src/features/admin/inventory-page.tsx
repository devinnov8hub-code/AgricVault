import { useState } from "react"

import { adminNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { BatchBadge, WithdrawalBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card, CardBody, CardHeader } from "@/components/ui/card"
import { Input } from "@/components/ui/field"
import { DataTable, EmptyState, Pagination, type Column } from "@/components/ui/table"
import { PAGE_SIZE, useBatches } from "@/features/inventory/queries"
import { QrTagModal } from "@/features/inventory/qr-tag-modal"
import { useDecideWithdrawal, useWithdrawals } from "@/features/withdrawals/queries"
import { useAuth } from "@/features/auth/auth-context"
import { dateShort, daysUntil, kilograms } from "@/lib/format"
import type { StorageBatch } from "@/types/models"

export default function AdminInventoryPage() {
  const { profile } = useAuth()
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)
  const [tagged, setTagged] = useState<StorageBatch | null>(null)

  const { data, isLoading } = useBatches(search, page)
  const { data: requests = [], isLoading: requestsLoading } = useWithdrawals("all", 15)
  const decide = useDecideWithdrawal()

  const columns: Array<Column<StorageBatch>> = [
    {
      key: "reference",
      header: "Storage ID",
      render: (row) => <span className="mono text-xs font-medium">{row.reference}</span>,
    },
    { key: "farmer", header: "Farmer", render: (row) => row.farmerName },
    { key: "produce", header: "Produce", render: (row) => row.produce ?? "—" },
    {
      key: "unit",
      header: "Room",
      render: (row) => <span className="mono text-xs">{row.unitCode}</span>,
    },
    {
      key: "weight",
      header: "Weight",
      numeric: true,
      render: (row) => kilograms(row.availableKg),
    },
    { key: "in", header: "Date in", render: (row) => dateShort(row.storedAt) },
    {
      key: "ends",
      header: "Ends",
      render: (row) => (
        <span className={daysUntil(row.expiresAt) <= 3 ? "text-critical" : undefined}>
          {dateShort(row.expiresAt)}
        </span>
      ),
    },
    { key: "status", header: "Status", render: (row) => <BatchBadge status={row.status} /> },
    {
      key: "tag",
      header: "Tag",
      render: (row) => (
        <Button variant="outline" size="sm" icon="qr_code_2" onClick={() => setTagged(row)}>
          QR tag
        </Button>
      ),
    },
  ]

  return (
    <AppShell
      nav={adminNav}
      title="Storage & inventory"
      subtitle="What is in each room, and who it belongs to"
      action={
        <Button icon="add" onClick={() => undefined}>
          Take in produce
        </Button>
      }
    >
      {requests.length > 0 && (
        <Card>
          <CardHeader
            title="Withdrawal requests"
            description="Approve a request, then mark it collected once the produce leaves."
            icon="outbox"
          />
          <CardBody className="p-0">
            {requestsLoading ? (
              <div className="p-4 text-xs text-ink-muted">Loading…</div>
            ) : (
              <ul>
                {requests.map((request) => (
                  <li
                    key={request.id}
                    className="flex flex-wrap items-center justify-between gap-3 border-b border-line px-4 py-3 last:border-0"
                  >
                    <div className="min-w-0">
                      <p className="text-sm font-medium">{request.farmerName}</p>
                      <p className="mono text-2xs text-ink-subtle">
                        {request.reference} · {request.batchReference} ·{" "}
                        {kilograms(request.quantityKg)}
                      </p>
                    </div>

                    <div className="flex items-center gap-2">
                      <WithdrawalBadge status={request.status} />
                      {request.status === "approved" && (
                        <Button
                          size="sm"
                          loading={decide.isPending}
                          onClick={() =>
                            decide.mutate({
                              request,
                              status: "collected",
                              decidedBy: profile?.id ?? "",
                            })
                          }
                        >
                          Mark collected
                        </Button>
                      )}
                      {request.status === "pending" && (
                        <>
                          <Button
                            size="sm"
                            variant="outline"
                            loading={decide.isPending}
                            onClick={() =>
                              decide.mutate({
                                request,
                                status: "rejected",
                                decidedBy: profile?.id ?? "",
                              })
                            }
                          >
                            Decline
                          </Button>
                          <Button
                            size="sm"
                            loading={decide.isPending}
                            onClick={() =>
                              decide.mutate({
                                request,
                                status: "approved",
                                decidedBy: profile?.id ?? "",
                              })
                            }
                          >
                            Approve
                          </Button>
                        </>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </CardBody>
        </Card>
      )}

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="w-full max-w-xs">
            <Input
              icon="search"
              placeholder="Search storage ID or farmer…"
              value={search}
              onChange={(event) => {
                setSearch(event.target.value)
                setPage(1)
              }}
            />
          </div>
        </div>

        <DataTable
          columns={columns}
          rows={data?.rows ?? []}
          rowKey={(row) => row.id}
          loading={isLoading}
          empty={
            <EmptyState
              title={search ? "No batches match that search" : "Nothing in storage"}
              description={
                search ? "Try a different storage ID or name." : "Produce taken in appears here."
              }
              icon="inventory"
            />
          }
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          noun="batches"
          onChange={setPage}
        />
      </Card>

      <QrTagModal batch={tagged} onClose={() => setTagged(null)} />
    </AppShell>
  )
}
