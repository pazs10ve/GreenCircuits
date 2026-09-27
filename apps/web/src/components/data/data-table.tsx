"use client"

import { useRouter } from "next/navigation"
import { useState } from "react"
import {
  flexRender,
  getCoreRowModel,
  getSortedRowModel,
  useReactTable,
  type ColumnDef,
  type Row,
  type RowData,
  type SortingState,
} from "@tanstack/react-table"
import { ArrowDown, ArrowUp, ChevronsUpDown } from "lucide-react"
import { cn } from "@/lib/utils"

declare module "@tanstack/react-table" {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface ColumnMeta<TData extends RowData, TValue> {
    /** Numbers are right-aligned. */
    align?: "left" | "right" | "center"
    /** Extra classes for the header and body cells of this column. */
    className?: string
    /** Keep the column visible while the table scrolls sideways. */
    sticky?: boolean
  }
}

/**
 * The app's table, set like a newspaper's: an ink rule under the headings,
 * hairlines between rows, tabular figures, no boxes. Headings sort, the
 * heading row stays put while the body scrolls, and rows can link somewhere.
 * Cells can render live components (LivePrice etc.), so the data array only
 * needs to change when sort keys change.
 */
export function DataTable<T>({
  columns,
  data,
  initialSorting = [],
  getRowId,
  getRowHref,
  rowClassName,
  className,
  maxHeight,
  empty = "Nothing to show.",
  dense = false,
}: {
  columns: ColumnDef<T, any>[] // eslint-disable-line @typescript-eslint/no-explicit-any
  data: T[]
  initialSorting?: SortingState
  getRowId?: (row: T, index: number) => string
  getRowHref?: (row: T) => string | undefined
  rowClassName?: (row: Row<T>) => string | undefined
  className?: string
  maxHeight?: number | string
  empty?: React.ReactNode
  dense?: boolean
}) {
  const router = useRouter()
  const [sorting, setSorting] = useState<SortingState>(initialSorting)
  // TanStack Table returns fresh functions each render by design; the React Compiler lint rule does not apply here.
  // eslint-disable-next-line react-hooks/incompatible-library
  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getRowId,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  })
  const rows = table.getRowModel().rows

  return (
    <div className={cn("scrollbar-thin relative w-full overflow-auto", className)} style={{ maxHeight }}>
      <table className="w-full border-separate border-spacing-0 text-sm">
        <thead className="sticky top-0 z-10">
          {table.getHeaderGroups().map((group) => (
            <tr key={group.id}>
              {group.headers.map((header) => {
                const meta = header.column.columnDef.meta
                const sortable = header.column.getCanSort()
                const dir = header.column.getIsSorted()
                const label = header.isPlaceholder ? null : flexRender(header.column.columnDef.header, header.getContext())
                return (
                  <th
                    key={header.id}
                    scope="col"
                    colSpan={header.colSpan}
                    aria-sort={dir === "asc" ? "ascending" : dir === "desc" ? "descending" : undefined}
                    className={cn(
                      "border-b border-ink bg-paper px-3 pt-1 pb-2 align-bottom text-xs font-normal whitespace-nowrap text-ink-3 first:pl-0 last:pr-0",
                      meta?.align === "right" ? "text-right" : meta?.align === "center" ? "text-center" : "text-left",
                      meta?.sticky && "sticky left-0 z-20",
                      meta?.className,
                    )}
                  >
                    {sortable ? (
                      <button
                        type="button"
                        onClick={header.column.getToggleSortingHandler()}
                        className={cn(
                          "group/sort inline-flex items-center gap-1 hover:text-ink",
                          meta?.align === "right" && "flex-row-reverse",
                          dir && "text-ink",
                        )}
                      >
                        {label}
                        {dir === "asc" ? (
                          <ArrowUp className="size-3" />
                        ) : dir === "desc" ? (
                          <ArrowDown className="size-3" />
                        ) : (
                          <ChevronsUpDown className="size-3 opacity-0 transition-opacity group-hover/sort:opacity-50" />
                        )}
                      </button>
                    ) : (
                      label
                    )}
                  </th>
                )
              })}
            </tr>
          ))}
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={table.getVisibleLeafColumns().length} className="py-10 text-center text-ink-2">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((row) => {
            const href = getRowHref?.(row.original)
            return (
              <tr
                key={row.id}
                onClick={href ? (e) => {
                  // Let real links and buttons inside the row handle their own clicks.
                  if ((e.target as HTMLElement).closest("a,button,input,select,[role=checkbox]")) return
                  router.push(href)
                } : undefined}
                className={cn("group/row", href && "cursor-pointer", rowClassName?.(row))}
              >
                {row.getVisibleCells().map((cell) => {
                  const meta = cell.column.columnDef.meta
                  return (
                    <td
                      key={cell.id}
                      className={cn(
                        "border-b border-rule bg-paper px-3 whitespace-nowrap first:pl-0 last:pr-0 group-hover/row:bg-surface",
                        dense ? "h-10" : "h-12",
                        meta?.align === "right" ? "num text-right" : meta?.align === "center" ? "text-center" : "text-left",
                        meta?.sticky && "sticky left-0 z-[1]",
                        meta?.className,
                      )}
                    >
                      {flexRender(cell.column.columnDef.cell, cell.getContext())}
                    </td>
                  )
                })}
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
