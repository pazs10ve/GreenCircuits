"use client"

import Link from "next/link"
import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ChevronRight } from "lucide-react"
import { EQUITIES, SECTORS, marketCapCr } from "@greencircuits/market/catalog"
import type { Instrument, Sector } from "@greencircuits/market/types"
import { formatCrore, formatNumber, formatPct } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { DataTable } from "@/components/data/data-table"
import { DayChange } from "@/components/market/price"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"

interface Mover {
  inst: Instrument
  pct: number
}

interface Row {
  sector: Sector
  count: number
  /** Share of the universe's market value at the previous close. */
  share: number
  mcap: number
  change: number | undefined
  adv: number
  dec: number
  unch: number
  best?: Mover
  worst?: Mover
}

const BY_SECTOR = new Map<Sector, Instrument[]>(SECTORS.map((s) => [s, EQUITIES.filter((e) => e.sector === s)]))

function MoverCell({ mover }: { mover: Mover | undefined }) {
  if (!mover) return <Skeleton className="h-4 w-24" />
  return (
    <Link href={`/stocks/${mover.inst.slug}`} className="inline-flex items-baseline gap-1.5 hover:underline">
      <span>{mover.inst.name}</span>
      <span className={cn("num text-[13px]", mover.pct > 0 ? "text-up" : mover.pct < 0 ? "text-down" : "text-ink-3")}>
        {formatPct(mover.pct)}
      </span>
    </Link>
  )
}

function BreadthCell({ row }: { row: Row }) {
  const total = row.adv + row.dec + row.unch
  if (total === 0) return <Skeleton className="h-4 w-24" />
  return (
    <span className="flex items-center gap-2" title={`${row.adv} advancing, ${row.dec} declining, ${row.unch} unchanged`}>
      <span className="flex h-1.5 w-16 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
        <span className="bg-up" style={{ width: `${(row.adv / total) * 100}%` }} />
        <span className="bg-ink-3/40" style={{ width: `${(row.unch / total) * 100}%` }} />
        <span className="bg-down" style={{ width: `${(row.dec / total) * 100}%` }} />
      </span>
      <span className="num text-[13px]">
        <span className="text-up">{row.adv}</span>
        <span className="text-ink-3"> / </span>
        <span className="text-down">{row.dec}</span>
      </span>
    </span>
  )
}

/** One row per sector: market-cap-weighted live change, breadth, and the best and worst stock. */
export function SectorsTable({ onPick }: { onPick: (sector: Sector) => void }) {
  const read = useQuoteReader(1000)

  const rows = useMemo(() => {
    const raw = SECTORS.map((sector): Row => {
      const members = BY_SECTOR.get(sector) ?? []
      let capPrev = 0
      let weighted = 0
      let mcap = 0
      let adv = 0
      let dec = 0
      let unch = 0
      let best: Mover | undefined
      let worst: Mover | undefined
      let live = 0
      for (const inst of members) {
        const q = read(inst.id)
        const cap = marketCapCr(inst, q?.prevClose ?? inst.prevClose)
        capPrev += cap
        mcap += marketCapCr(inst, q?.ltp ?? inst.prevClose)
        if (!q) continue
        live++
        weighted += cap * q.changePct
        if (q.changePct > 0.01) adv++
        else if (q.changePct < -0.01) dec++
        else unch++
        if (!best || q.changePct > best.pct) best = { inst, pct: q.changePct }
        if (!worst || q.changePct < worst.pct) worst = { inst, pct: q.changePct }
      }
      return {
        sector,
        count: members.length,
        share: capPrev,
        mcap,
        change: live > 0 ? weighted / capPrev : undefined,
        adv,
        dec,
        unch,
        best,
        worst,
      }
    })
    // Weights are shares of the whole universe's value at the previous close.
    const total = raw.reduce((sum, r) => sum + r.share, 0) || 1
    return raw.map((r) => ({ ...r, share: r.share / total }))
  }, [read])

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "sector",
        header: "Sector",
        accessorFn: (r) => r.sector,
        cell: ({ row }) => (
          <button
            type="button"
            onClick={() => onPick(row.original.sector)}
            className="group/sector inline-flex items-center gap-1 font-medium text-ink hover:underline hover:decoration-1 hover:underline-offset-4"
            aria-label={`Show ${row.original.sector} stocks`}
          >
            {row.original.sector}
            <ChevronRight className="size-3.5 text-ink-3 group-hover/sector:text-ink" />
          </button>
        ),
        meta: { sticky: true, className: "min-w-[130px]" },
      },
      {
        id: "count",
        header: "Companies",
        accessorFn: (r) => r.count,
        meta: { align: "right" },
      },
      {
        id: "share",
        header: "Weight",
        accessorFn: (r) => r.share,
        cell: ({ row }) => (
          <span className="flex items-center justify-end gap-2">
            <span className="h-1.5 w-14 overflow-hidden rounded-full bg-surface-2" aria-hidden="true">
              <span className="block h-full rounded-full bg-ink-3" style={{ width: `${row.original.share * 100}%` }} />
            </span>
            <span className="w-11">{formatNumber(row.original.share * 100, 1)}%</span>
          </span>
        ),
        meta: { align: "right" },
      },
      {
        id: "mcap",
        header: "Market value",
        accessorFn: (r) => r.mcap,
        cell: ({ row }) => formatCrore(row.original.mcap),
        meta: { align: "right" },
      },
      {
        id: "change",
        header: "Day",
        accessorFn: (r) => r.change ?? 0,
        cell: ({ row }) => <DayChange pct={row.original.change} />,
        meta: { align: "right" },
      },
      {
        id: "breadth",
        header: "Up / down",
        accessorFn: (r) => r.adv / Math.max(1, r.adv + r.dec),
        cell: ({ row }) => <BreadthCell row={row.original} />,
      },
      {
        id: "best",
        header: "Best",
        accessorFn: (r) => r.best?.pct ?? 0,
        cell: ({ row }) => <MoverCell mover={row.original.best} />,
      },
      {
        id: "worst",
        header: "Worst",
        accessorFn: (r) => r.worst?.pct ?? 0,
        cell: ({ row }) => <MoverCell mover={row.original.worst} />,
      },
    ],
    [onPick],
  )

  return (
    <div className="flex flex-col">
      <DataTable columns={columns} data={rows} initialSorting={[{ id: "share", desc: true }]} getRowId={(r) => r.sector} />
      <p className="mt-3 text-sm text-ink-3">Each sector&apos;s move is weighted by market value at the previous close. Pick a sector to list its companies.</p>
    </div>
  )
}
