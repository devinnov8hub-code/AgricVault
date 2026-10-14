import type { ReactNode } from "react"

import { Icon } from "@/components/ui/icon"
import { cn } from "@/lib/cn"

export interface Column<Row> {
  /** Stable key; also the header label unless `header` is given. */
  key: string
  header?: string
  /** Right-aligned and mono — use for money, weights and counts. */
  numeric?: boolean
  width?: string
  render: (row: Row) => ReactNode
}

export interface DataTableProps<Row> {
  columns: Array<Column<Row>>
  rows: Row[]
  rowKey: (row: Row) => string
  loading?: boolean
  /** Shown instead of the body when there are no rows and nothing is loading. */
  empty?: ReactNode
  onRowClick?: (row: Row) => void
}

/**
 * The single table in the system. Headers are small caps on a tinted band,
 * rows are separated by a hairline, numbers sit right and in mono so a column
 * of figures lines up.
 */
export function DataTable<Row>({
  columns,
  rows,
  rowKey,
  loading = false,
  empty,
  onRowClick,
}: DataTableProps<Row>) {
  return (
    <div className="overflow-x-auto scrollbar-thin">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr className="bg-brand-50">
            {columns.map((column) => (
              <th
                key={column.key}
                scope="col"
                style={column.width ? { width: column.width } : undefined}
                className={cn(
                  "px-4 py-3 text-xs font-semibold tracking-wide text-brand-600 whitespace-nowrap uppercase",
                  column.numeric ? "text-right" : "text-left",
                )}
              >
                {column.header ?? column.key}
              </th>
            ))}
          </tr>
        </thead>

        <tbody>
          {loading &&
            Array.from({ length: 6 }, (_, index) => (
              <tr key={`skeleton-${index}`} className="border-b border-line last:border-0">
                {columns.map((column) => (
                  <td key={column.key} className="px-4 py-4">
                    <span className="block h-4 w-full max-w-24 animate-pulse rounded bg-neutral-200" />
                  </td>
                ))}
              </tr>
            ))}

          {!loading &&
            rows.map((row) => (
              <tr
                key={rowKey(row)}
                onClick={onRowClick ? () => onRowClick(row) : undefined}
                className={cn(
                  "border-b border-line last:border-0",
                  onRowClick && "cursor-pointer hover:bg-neutral-50",
                )}
              >
                {columns.map((column) => (
                  <td
                    key={column.key}
                    data-numeric={column.numeric || undefined}
                    className={cn(
                      "px-4 py-4 align-middle",
                      column.numeric ? "text-right font-mono" : "text-left",
                    )}
                  >
                    {column.render(row)}
                  </td>
                ))}
              </tr>
            ))}

          {!loading && rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-12">
                {empty ?? <EmptyState title="Nothing here yet" />}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  )
}

/* -- Empty state ----------------------------------------------------------- */

export interface EmptyStateProps {
  title: string
  description?: string
  icon?: string
  action?: ReactNode
}

export function EmptyState({ title, description, icon = "inbox", action }: EmptyStateProps) {
  return (
    <div className="flex flex-col items-center gap-3 py-8 text-center">
      <span className="flex size-12 items-center justify-center rounded-full bg-neutral-100 text-ink-subtle">
        <Icon name={icon} className="text-2xl" />
      </span>
      <div>
        <p className="text-sm font-medium text-ink">{title}</p>
        {description && <p className="pt-1 text-xs text-ink-muted">{description}</p>}
      </div>
      {action}
    </div>
  )
}

/* -- Pagination ------------------------------------------------------------ */

export interface PaginationProps {
  page: number
  pageSize: number
  total: number
  /** Plural noun for the count line, e.g. "payments". */
  noun: string
  onChange: (page: number) => void
}

export function Pagination({ page, pageSize, total, noun, onChange }: PaginationProps) {
  const pages = Math.max(1, Math.ceil(total / pageSize))
  const first = total === 0 ? 0 : (page - 1) * pageSize + 1
  const last = Math.min(page * pageSize, total)

  // A sliding window of at most three page numbers around the current one.
  const start = Math.max(1, Math.min(page - 1, pages - 2))
  const window = Array.from({ length: Math.min(3, pages) }, (_, index) => start + index)

  return (
    <nav
      aria-label="Pagination"
      className="flex items-center justify-between gap-4 border-t border-line px-4 py-3 text-xs text-ink-muted"
    >
      <span>
        Showing <span className="mono">{first}</span>–<span className="mono">{last}</span> of{" "}
        <span className="mono">{total}</span> {noun}
      </span>

      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={page <= 1}
          onClick={() => onChange(page - 1)}
          className="rounded-sm border border-line-strong px-3 py-1 transition-colors hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Previous
        </button>

        {window.map((number) => (
          <button
            key={number}
            type="button"
            aria-current={number === page ? "page" : undefined}
            onClick={() => onChange(number)}
            className={cn(
              "mono size-7 rounded-sm border transition-colors",
              number === page
                ? "border-brand-600 bg-brand-600 text-neutral-0"
                : "border-line-strong hover:bg-neutral-50",
            )}
          >
            {number}
          </button>
        ))}

        <button
          type="button"
          disabled={page >= pages}
          onClick={() => onChange(page + 1)}
          className="rounded-sm border border-line-strong px-3 py-1 transition-colors hover:bg-neutral-50 disabled:opacity-40 disabled:hover:bg-transparent"
        >
          Next
        </button>
      </div>
    </nav>
  )
}
