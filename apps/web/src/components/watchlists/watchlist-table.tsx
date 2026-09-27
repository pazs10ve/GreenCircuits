"use client"

import Link from "next/link"
import { useMemo } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { ArrowDown, ArrowUp, BellPlus, MoreHorizontal, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DataTable } from "@/components/data/data-table"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { LiveChange, LivePrice } from "@/components/market/price"
import { Sparkline } from "@/components/market/sparkline"
import { withLive } from "@/components/stocks/derive"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getInstrument } from "@greencircuits/market/catalog"
import { sparkline } from "@greencircuits/market/history"
import { useUniverse } from "@/lib/data/client"
import { useMarket } from "@/lib/stream/market-context"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatCompact, formatNumber } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useWatchlists, type Watchlist } from "@/lib/stores/watchlists"

interface Row {
  index: number
  inst: Instrument
  q: Quote | undefined
  spark: number[]
}

function DayRange({ q }: { q: Quote | undefined }) {
  if (!q) return <span className="text-ink-3">–</span>
  const span = Math.max(q.high - q.low, 1e-9)
  const pos = ((q.ltp - q.low) / span) * 100
  return (
    <span className="inline-flex w-24 flex-col gap-1" title="The day's low to high">
      <span className="relative h-1 rounded-full bg-surface-2">
        <span className="absolute top-1/2 size-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-paper bg-ink" style={{ left: `${pos}%` }} />
      </span>
    </span>
  )
}

export function WatchlistTable({ list }: { list: Watchlist }) {
  const read = useQuoteReader(1000)
  const move = useWatchlists((s) => s.move)
  const removeItem = useWatchlists((s) => s.removeItem)
  const add = useWatchlists((s) => s.add)

  // A month of closes: the API's in live mode, the generators' in the demo.
  const { mode, dataset } = useMarket()
  const universe = useUniverse()
  const sparks = useMemo(
    () => new Map(list.ids.map((id) => [id, mode === "live" ? (universe.data?.byId.get(id)?.spark ?? []) : sparkline(getInstrument(id)!, 30)])),
    [list.ids, mode, universe.data],
  )
  const rows = useMemo<Row[]>(() => {
    return list.ids
      .map((id, index) => ({ index, inst: getInstrument(id)!, q: read(id), spark: sparks.get(id) ?? [] }))
      .filter((r) => r.inst)
  }, [list.ids, sparks, read])

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "instrument",
        header: "Name",
        accessorFn: (r) => r.inst.name,
        meta: { sticky: true },
        cell: ({ row: { original: r } }) => (
          <Link href={r.inst.kind === "COMMODITY" ? `/commodities?c=${r.inst.slug}` : `/stocks/${r.inst.slug}`} className="group block min-w-44 leading-snug">
            <span className="block max-w-60 truncate font-medium text-ink group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{r.inst.name}</span>
            <span className="block max-w-60 truncate text-[13px] text-ink-3">
              {r.inst.symbol} · {r.inst.exchange}
            </span>
          </Link>
        ),
      },
      {
        id: "ltp",
        header: "Price",
        accessorFn: (r) => r.q?.ltp ?? 0,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <LivePrice id={r.inst.id} />,
      },
      {
        id: "change",
        header: "Day",
        accessorFn: (r) => r.q?.changePct ?? 0,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <LiveChange id={r.inst.id} />,
      },
      {
        id: "range",
        header: "Day's range",
        enableSorting: false,
        cell: ({ row: { original: r } }) => <DayRange q={r.q} />,
      },
      {
        id: "volume",
        header: "Volume",
        accessorFn: (r) => r.q?.volume ?? 0,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) =>
          r.q && r.inst.avgVolume > 0 ? (
            <span title={`${formatNumber(r.q.volume / r.inst.avgVolume, 2)}× the average day`}>{formatCompact(r.q.volume)}</span>
          ) : (
            <span className="text-ink-3">–</span>
          ),
      },
      {
        id: "trend",
        header: "30 days",
        enableSorting: false,
        cell: ({ row: { original: r } }) => <Sparkline data={withLive(r.spark, r.q?.ltp, dataset === "real")} width={84} height={24} />,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => (
          <span className="inline-flex items-center gap-0.5">
            <AlertDialogButton
              instrumentId={r.inst.id}
              trigger={
                <Button variant="ghost" size="icon-sm" aria-label={`Create alert for ${r.inst.symbol}`}>
                  <BellPlus />
                </Button>
              }
            />
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon-sm" aria-label={`More actions for ${r.inst.symbol}`}>
                  <MoreHorizontal />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-44">
                <DropdownMenuItem disabled={r.index === 0} onSelect={() => move(list.id, r.index, r.index - 1)}>
                  <ArrowUp /> Move up
                </DropdownMenuItem>
                <DropdownMenuItem disabled={r.index === list.ids.length - 1} onSelect={() => move(list.id, r.index, r.index + 1)}>
                  <ArrowDown /> Move down
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  variant="destructive"
                  onSelect={() => {
                    removeItem(list.id, r.inst.id)
                    toast(`Removed ${r.inst.symbol}`, {
                      action: { label: "Undo", onClick: () => add(list.id, r.inst.id) },
                    })
                  }}
                >
                  <Trash2 /> Remove
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </span>
        ),
      },
    ],
    [list.id, list.ids.length, move, removeItem, add, dataset],
  )

  return <DataTable columns={columns} data={rows} getRowId={(r) => String(r.inst.id)} />
}
