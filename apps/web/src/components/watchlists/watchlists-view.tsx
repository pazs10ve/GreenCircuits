"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { MoreHorizontal, Pencil, Plus, Star, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { InstrumentPicker } from "@/components/market/instrument-picker"
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
import { formatNumber, formatPct } from "@greencircuits/market/format"
import type { Quote } from "@greencircuits/market/types"
import { useQuoteReader, useSession } from "@/lib/stream/hooks"
import { useWatchlists, type Watchlist } from "@/lib/stores/watchlists"
import { cn } from "@/lib/utils"
import { DeleteListDialog, ListNameDialog } from "./list-dialogs"
import { WatchlistTable } from "./watchlist-table"

/** A tile's colour: green or red, stronger the bigger the day's move (3% is full strength). */
function heatColor(pct: number | undefined): string {
  if (pct == null) return "var(--surface)"
  const x = Math.max(-1, Math.min(1, pct / 3))
  const strength = Math.round(12 + Math.abs(x) * 50)
  return `color-mix(in oklch, ${x >= 0 ? "var(--up)" : "var(--down)"} ${strength}%, var(--paper))`
}

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
  const { closed } = useSession()
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

  const when = closed ?? "today"
  const lede = !active
    ? "No watchlists yet. Make one to follow companies, indices, commodities and currencies side by side."
    : !summary
      ? `${active.name} is empty. Add companies, indices, commodities or currencies to follow them here.`
      : `${active.name}: ${summary.adv} of ${summary.rows.length} ${closed ? "closed" : "are"} higher ${when}, ${formatNumber(Math.abs(summary.avg), 1)}% ${summary.avg >= 0 ? "up" : "down"} on average. ` +
        `${summary.best.inst.name} did best, ${formatPct(summary.best.q!.changePct)}, and ${summary.worst.inst.name} worst, ${formatPct(summary.worst.q!.changePct)}.`

  return (
    <>
      <PageHead
        title="Watchlists"
        lede={lede}
        actions={
          <>
            <Button variant="outline" onClick={() => setDialog({ kind: "new" })}>
              <Plus /> New list
            </Button>
            {picker}
          </>
        }
      />

      {/* Small screens: the lists as a row of tabs. */}
      <div className="no-scrollbar -mx-5 mt-8 overflow-x-auto px-5 lg:hidden">
        <ul className="flex min-w-max gap-5 border-b border-rule">
          {lists.map((l) => (
            <li key={l.id}>
              <button
                type="button"
                onClick={() => setActive(l.id)}
                aria-current={l.id === active?.id ? "true" : undefined}
                className={cn(
                  "-mb-px border-b-2 pb-2 text-[0.9375rem]",
                  l.id === active?.id ? "border-ink text-ink" : "border-transparent text-ink-2 hover:text-ink",
                )}
              >
                {l.name} <span className="num text-ink-3">{l.ids.length}</span>
              </button>
            </li>
          ))}
        </ul>
      </div>

      <div className="mt-8 grid grid-cols-[minmax(0,1fr)] gap-x-12 gap-y-10 lg:mt-12 lg:grid-cols-[15rem_minmax(0,1fr)]">
        <nav aria-label="Your lists" className="hidden self-start lg:block">
          <h2 className="border-b border-ink pb-2 text-sm font-semibold">Your lists</h2>
          <ul className="divide-y divide-rule border-b border-rule">
            {lists.map((l) => {
              const avg = avgChange(l, read)
              const selected = l.id === active?.id
              return (
                <li key={l.id} className="group relative">
                  <button
                    type="button"
                    onClick={() => setActive(l.id)}
                    aria-current={selected ? "true" : undefined}
                    className={cn("flex w-full flex-col py-3 pr-9 text-left", selected && "-mx-2 w-[calc(100%+1rem)] bg-surface px-2 pr-11")}
                  >
                    <span className={cn("truncate text-[0.9375rem] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4", selected ? "font-semibold" : "font-medium")}>
                      {l.name}
                    </span>
                    <span className="num text-sm text-ink-3">
                      {l.ids.length} {l.ids.length === 1 ? "name" : "names"}
                      {avg != null && <span className={cn("ml-1.5", avg > 0 ? "text-up" : avg < 0 ? "text-down" : "")}>{formatPct(avg)}</span>}
                    </span>
                  </button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button
                        variant="ghost"
                        size="icon-sm"
                        aria-label={`Options for ${l.name}`}
                        className="absolute top-1/2 right-0 -translate-y-1/2 opacity-0 group-hover:opacity-100 focus-visible:opacity-100 data-[state=open]:opacity-100"
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
        </nav>

        <div className="min-w-0 space-y-14">
          {!active ? (
            <Empty className="border-y border-rule py-16">
              <EmptyHeader>
                <EmptyMedia variant="icon">
                  <Star />
                </EmptyMedia>
                <EmptyTitle>No watchlists</EmptyTitle>
                <EmptyDescription>Make a list to follow companies, indices and commodities together.</EmptyDescription>
              </EmptyHeader>
              <EmptyContent>
                <Button onClick={() => setDialog({ kind: "new" })}>
                  <Plus /> New list
                </Button>
              </EmptyContent>
            </Empty>
          ) : (
            <>
              <Section
                title={active.name}
                description={`${active.ids.length} ${active.ids.length === 1 ? "name" : "names"}, with live prices.`}
                action={
                  <Button variant="ghost" size="sm" onClick={() => setDialog({ kind: "rename", list: active })}>
                    <Pencil /> Rename
                  </Button>
                }
              >
                {active.ids.length === 0 ? (
                  <Empty className="border-y border-rule py-14">
                    <EmptyHeader>
                      <EmptyMedia variant="icon">
                        <Star />
                      </EmptyMedia>
                      <EmptyTitle>This list is empty</EmptyTitle>
                      <EmptyDescription>Add companies, indices, commodities or currencies to follow them here.</EmptyDescription>
                    </EmptyHeader>
                    <EmptyContent>{picker}</EmptyContent>
                  </Empty>
                ) : (
                  <WatchlistTable list={active} />
                )}
              </Section>
              {summary && summary.rows.length > 1 && (
                <Section title="At a glance" description="Each tile is coloured by the day's move: the deeper the colour, the bigger the move.">
                  <div className="grid grid-cols-[repeat(auto-fill,minmax(128px,1fr))] gap-1.5">
                    {summary.rows.map(({ inst, q }) => (
                      <Link
                        key={inst.id}
                        href={inst.kind === "COMMODITY" ? `/commodities?c=${inst.slug}` : `/stocks/${inst.slug}`}
                        className="flex h-[4.5rem] flex-col justify-center rounded-[3px] px-3 transition-[background-color] duration-700 hover:ring-1 hover:ring-ink/40"
                        style={{ backgroundColor: heatColor(q!.changePct) }}
                      >
                        <span className="truncate text-sm font-medium">{inst.name}</span>
                        <span className="num text-[13px] opacity-80">{formatPct(q!.changePct)}</span>
                      </Link>
                    ))}
                  </div>
                </Section>
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
