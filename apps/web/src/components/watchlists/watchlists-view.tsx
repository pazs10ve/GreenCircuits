"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Panel } from "@/components/shell/page-header"
import { InstrumentPicker } from "@/components/market/instrument-picker"
import { heatColor } from "@/components/market/sector-heatmap"
import { Stat, toneOf } from "@/components/market/stat"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { Empty, EmptyContent, EmptyDescription, EmptyHeader, EmptyMedia, EmptyTitle } from "@/components/ui/empty"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatPct } from "@greencircuits/market/format"
import type { Quote } from "@greencircuits/market/types"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useWatchlists, type Watchlist } from "@/lib/stores/watchlists"
import { cn } from "@/lib/utils"
import { DeleteListDialog, ListNameDialog } from "./list-dialogs"
import { WatchlistTable } from "./watchlist-table"

function avgChange(list: Watchlist, read: (id: number) => Quote | undefined): number | undefined {
  const qs = list.ids.map((id) => read(id)).filter((q) => q != null)
  if (qs.length === 0) return undefined
  return qs.reduce((s, q) => s + q.changePct, 0) / qs.length
}

export function WatchlistsView() {
  const lists = useWatchlists((s) => s.lists)
  const activeId = useWatchlists((s) => s.activeId)
  const setActive = useWatchlists((s) => s.setActive)
  const add = useWatchlists((s) => s.add)
  const read = useQuoteReader(1500)
  const [dialog, setDialog] = useState<{ kind: "new" | "rename" | "delete"; list?: Watchlist } | null>(null)

  const active = lists.find((l) => l.id === activeId) ?? lists[0]

  const summary = useMemo(() => {
    if (!active) return null
    const rows = active.ids
      .map((id) => ({ inst: getInstrument(id)!, q: read(id) }))
      .filter((r) => r.inst && r.q)
    if (rows.length === 0) return null
    const sorted = [...rows].sort((a, b) => b.q!.changePct - a.q!.changePct)
    return {
      adv: rows.filter((r) => r.q!.changePct > 0).length,
      dec: rows.filter((r) => r.q!.changePct < 0).length,
      avg: rows.reduce((s, r) => s + r.q!.changePct, 0) / rows.length,
      best: sorted[0]!,
      worst: sorted.at(-1)!,
      rows,
    }
  }, [active, read])

  const picker = active && (
    <InstrumentPicker
      exclude={active.ids}
      onSelect={(inst) => {
        add(active.id, inst.id)
        toast(`Added ${inst.symbol} to ${active.name}`)
      }}
    />
  )

  return (
    <>
      {/* Mobile: lists as chips. */}
      <div className="no-scrollbar -mx-4 flex gap-2 overflow-x-auto px-4 lg:hidden">
        {lists.map((l) => (
          <button
            key={l.id}
            type="button"
            onClick={() => setActive(l.id)}
            className={cn(
              "shrink-0 rounded-full border px-3 py-1 text-xs",
              l.id === active?.id ? "border-primary/50 bg-primary/10 font-medium text-foreground" : "text-muted-foreground",
            )}
          >
            {l.name} <span className="num text-muted-foreground">{l.ids.length}</span>
          </button>
        ))}
        <button type="button" onClick={() => setDialog({ kind: "new" })} className="shrink-0 rounded-full border border-dashed px-3 py-1 text-xs text-muted-foreground">
          + New list
        </button>
      </div>

      <div className="grid gap-4 lg:grid-cols-[250px_minmax(0,1fr)]">
        <Panel
          title="Lists"
          className="hidden self-start lg:flex"
          actions={
            <Button variant="ghost" size="icon-sm" aria-label="New watchlist" onClick={() => setDialog({ kind: "new" })}>
              <Plus />
            </Button>
          }
        >
          <ul className="p-1.5">
            {lists.map((l) => {
              const avg = avgChange(l, read)
              const selected = l.id === active?.id
              return (
                <li key={l.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setActive(l.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cn(
                      "flex w-full items-center gap-2 rounded-md px-2.5 py-2 pr-9 text-left hover:bg-muted/60",
                      selected && "bg-muted",
                    )}
                  >
                    <Star className={cn("size-3.5 shrink-0", selected ? "fill-primary text-primary" : "text-muted-foreground")} />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-medium">{l.name}</span>
                      <span className="num block text-[11px] text-muted-foreground">
                        {l.ids.length} {l.ids.length === 1 ? "instrument" : "instruments"}
                        {avg != null && (
                          <span className={cn("ml-1.5", avg > 0 ? "text-up" : avg < 0 ? "text-down" : "")}>{formatPct(avg)}</span>
                        )}
                      </span>
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Options for ${l.name}`}
                        className="absolute top-1/2 right-1.5 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
                      >
                        <MoreHorizontal />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-40">
                      <DropdownMenuItem onSelect={() => setDialog({ kind: "rename", list: l })}>
                        <Pencil /> Rename
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem variant="destructive" onSelect={() => setDialog({ kind: "delete", list: l })}>
                        <Trash2 /> Delete
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </li>
              )
            })}
          </ul>
          <p className="border-t px-4 py-3 text-[11px] text-muted-foreground">Lists are saved in this browser until accounts are enabled.</p>
        </Panel>

        <div className="flex min-w-0 flex-col gap-4">
          {!active ? (
            <Panel>
              <Empty className="py-16">
                <EmptyHeader>
                  <EmptyMedia variant="icon">
                    <Star />
                  </EmptyMedia>
                  <EmptyTitle>No watchlists</EmptyTitle>
                  <EmptyDescription>Create a list to follow stocks, indices and commodities together.</EmptyDescription>
                </EmptyHeader>
                <EmptyContent>
                  <Button onClick={() => setDialog({ kind: "new" })}>
                    <Plus /> New watchlist
                  </Button>
                </EmptyContent>
              </Empty>
            </Panel>
          ) : (
            <>
              <Panel
                title={active.name}
                description={`${active.ids.length} ${active.ids.length === 1 ? "instrument" : "instruments"} · live`}
                actions={
                  <>
                    <Button variant="ghost" size="icon-sm" aria-label="Rename list" onClick={() => setDialog({ kind: "rename", list: active })} className="lg:hidden">
                      <Pencil />
                    </Button>
                    {picker}
                  </>
                }
              >
                {summary && (
                  <div className="grid grid-cols-2 gap-4 border-b px-4 py-3 sm:grid-cols-4">
                    <Stat label="Average change" value={formatPct(summary.avg)} tone={toneOf(summary.avg)} />
                    <Stat
                      label="Advancing / declining"
                      value={
                        <>
                          <span className="text-up">{summary.adv}</span>
                          <span className="text-muted-foreground"> / </span>
                          <span className="text-down">{summary.dec}</span>
                        </>
                      }
                    />
                    <Stat label="Best" value={summary.best.inst.symbol} hint={formatPct(summary.best.q!.changePct)} />
                    <Stat label="Worst" value={summary.worst.inst.symbol} hint={formatPct(summary.worst.q!.changePct)} />
                  </div>
                )}
                {active.ids.length === 0 ? (
                  <Empty className="py-14">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Star />
                      </EmptyMedia>
                      <EmptyTitle>This list is empty</EmptyTitle>
                      <EmptyDescription>Add stocks, indices, commodities or currencies to follow them here.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>{picker}</EmptyContent>
                  </Empty>
                ) : (
                  <WatchlistTable list={active} />
                )}
              </Panel>

              {summary && summary.rows.length > 1 && (
                <Panel title="At a glance" description="Each tile is coloured by the day's change">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(112px,1fr))] gap-1.5 p-3">
                    {summary.rows.map(({ inst, q }) => (
                      <Link
                        key={inst.id}
                        href={inst.kind === "COMMODITY" ? `/commodities?c=${inst.slug}` : `/stocks/${inst.slug}`}
                        className="flex h-16 flex-col justify-center rounded-md px-2.5 transition-[background-color] duration-700 hover:ring-1 hover:ring-foreground/40"
                        style={{ backgroundColor: heatColor(q!.changePct) }}
                      >
                        <span className="truncate text-xs font-semibold">{inst.symbol}</span>
                        <span className="num text-[11px] opacity-80">{formatPct(q!.changePct)}</span>
                      </Link>
                    ))}
                  </div>
                </Panel>
              )}
            </>
          )}
        </div>
      </div>

      <ListNameDialog
        open={dialog?.kind === "new" || dialog?.kind === "rename"}
        onOpenChange={(o) => !o && setDialog(null)}
        list={dialog?.kind === "rename" ? dialog.list : undefined}
      />
      <DeleteListDialog open={dialog?.kind === "delete"} onOpenChange={(o) => !o && setDialog(null)} list={dialog?.list} />
    </>
  )
}
