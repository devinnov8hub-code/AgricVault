import { useState } from "react"

import { adminNav } from "@/app/routes/nav"
import { AppShell } from "@/components/layout/app-shell"
import { AccountBadge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Input } from "@/components/ui/field"
import { DataTable, EmptyState, Pagination, type Column } from "@/components/ui/table"
import { PAGE_SIZE, useUserDirectory, type DirectoryRow } from "@/features/inventory/queries"
import { kilograms, naira } from "@/lib/format"

const columns: Array<Column<DirectoryRow>> = [
  { key: "name", header: "Name", render: (row) => row.fullName },
  {
    key: "phone",
    header: "Phone",
    render: (row) => <span className="mono text-xs">{row.phone ?? "—"}</span>,
  },
  {
    key: "units",
    header: "Unit",
    render: (row) => <span className="mono text-xs">{row.units}</span>,
  },
  { key: "stored", header: "Stored", numeric: true, render: (row) => kilograms(row.storedKg) },
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
  { key: "status", header: "Status", render: (row) => <AccountBadge status={row.status} /> },
]

export default function AdminUsersPage() {
  const [search, setSearch] = useState("")
  const [page, setPage] = useState(1)

  const { data, isLoading } = useUserDirectory(search, page)

  return (
    <AppShell
      nav={adminNav}
      title="Users"
      subtitle="Register and manage storage users"
      action={
        <Button icon="person_add" onClick={() => undefined}>
          Register user
        </Button>
      }
    >
      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-line p-4">
          <div className="w-full max-w-xs">
            <Input
              icon="search"
              placeholder="Search name, phone or email…"
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
              title={search ? "No users match that search" : "No users yet"}
              description={
                search ? "Try a different name or number." : "Registered farmers appear here."
              }
              icon="group_off"
            />
          }
        />

        <Pagination
          page={page}
          pageSize={PAGE_SIZE}
          total={data?.total ?? 0}
          noun="users"
          onChange={setPage}
        />
      </Card>
    </AppShell>
  )
}
