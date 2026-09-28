"use client"

import Link from "next/link"
import { useCallback, useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { BellRing, Plus, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DataTable } from "@/components/data/data-table"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { InstrumentPicker } from "@/components/market/instrument-picker"
import { LivePrice } from "@/components/market/price"
import { LiveMove } from "@/components/parts/live-move"
import { Monogram } from "@/components/parts/monogram"
import { RangeMarker } from "@/components/parts/range-marker"
import { Tag } from "@/components/parts/tag"
import { Segmented } from "@/components/market/segmented"
import { Figure, Figures } from "@/components/editorial/figures"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { getInstrument, hrefOf } from "@greencircuits/market/catalog"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatDateIST, formatNumber, formatPct, formatPrice, formatTimeIST } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { CONDITION_LABEL, isPercent, useAlerts, type Alert, type AlertChannel } from "@/lib/stores/alerts"
import { cn } from "@/lib/utils"

type Filter = "ALL" | "ACTIVE" | "TRIGGERED" | "PAUSED"

const CHANNEL: Record<AlertChannel, string> = { IN_APP: "in the app", EMAIL: "by email", TELEGRAM: "on Telegram" }

interface Row {
  alert: Alert
  inst: Instrument
  q: Quote | undefined
  /** How far the market has to move for the alert to fire: % of price, or percentage points for change alerts. */
  distance: number | undefined
}

function distanceOf(a: Alert, q: Quote | undefined): number | undefined {
  if (!q) return undefined
  switch (a.condition) {
    case "PRICE_ABOVE":
      return ((a.value - q.ltp) / q.ltp) * 100
    case "PRICE_BELOW":
      return ((q.ltp - a.value) / q.ltp) * 100
    case "CHANGE_ABOVE":
      return a.value - q.changePct
    case "CHANGE_BELOW":
      return q.changePct - a.value
  }
}

/** The alert's threshold as written: a day's move, an index level or a price in rupees. */
function level(a: Alert, inst: Instrument): string {
  if (isPercent(a.condition)) return formatPct(a.value)
  return inst.kind === "INDEX" ? formatNumber(a.value, 2) : `₹${formatPrice(a.value, inst.tick >= 0.05 ? inst.tick : 0.01)}`
}

/** What the alert waits for, as a phrase: "falling below ₹1,400", "falling more than 1.5% in a day". */
function waitingFor(a: Alert, inst: Instrument): string {
  const v = formatNumber(Math.abs(a.value), 1)
  switch (a.condition) {
    case "PRICE_ABOVE":
      return `rising above ${level(a, inst)}`
    case "PRICE_BELOW":
      return `falling below ${level(a, inst)}`
    case "CHANGE_ABOVE":
      return a.value >= 0 ? `rising more than ${v}% in a day` : `a day's move above ${formatPct(a.value)}`
    case "CHANGE_BELOW":
      return a.value <= 0 ? `falling more than ${v}% in a day` : `a day's move below ${formatPct(a.value)}`
  }
}

/**
 * How far a price alert is from going off, on a small track: the marker is the
 * price now, the tick the level the alert waits for. The same part as a
 * company's 52-week range.
 */
function Track({ r, className = "hidden w-24 sm:block" }: { r: Row; className?: string }) {
  if (!r.q || isPercent(r.alert.condition)) return null
  const lo = Math.min(r.q.ltp, r.alert.value) * 0.985
  const hi = Math.max(r.q.ltp, r.alert.value) * 1.015
  const at = (v: number) => (v - lo) / Math.max(hi - lo, 1e-9)
  const near = r.distance != null && r.distance < 1
  return <RangeMarker className={className} value={at(r.q.ltp)} mark={at(r.alert.value)} markerClassName={near ? "bg-attn" : undefined} />
}

function NameCell({ r }: { r: Row }) {
  return (
    <Link href={hrefOf(r.inst)} className="group flex min-w-44 items-center gap-2.5 leading-snug">
      <Monogram text={r.inst.kind === "EQUITY" ? r.inst.symbol : r.inst.name} size={28} />
      <span className="min-w-0">
        <span className="block max-w-52 truncate font-semibold text-ink decoration-rule-strong group-hover:underline group-hover:underline-offset-4">{r.inst.name}</span>
        <span className="block max-w-52 truncate text-xs text-ink-3">{r.inst.symbol}</span>
      </span>
    </Link>
  )
}

/** The condition, with the note, where it tells you and when it was set in a line under it. */
function WhenCell({ r }: { r: Row }) {
  const detail = [r.alert.note, `tells you ${r.alert.channels.map((c) => CHANNEL[c]).join(", ")}${r.alert.repeat ? ", once a day" : ""}`, `set ${formatDateIST(r.alert.createdAt, "short")}`]
    .filter(Boolean)
    .join(" · ")
  return (
    <span className="block min-w-44">
      <span className="block">
        {CONDITION_LABEL[r.alert.condition]} <span className="num font-medium">{level(r.alert, r.inst)}</span>
      </span>
      <span className="block max-w-64 truncate text-xs text-ink-3 first-letter:uppercase" title={detail}>
        {detail}
      </span>
    </span>
  )
}

function NowCell({ r }: { r: Row }) {
  return isPercent(r.alert.condition) ? <LiveMove id={r.inst.id} /> : <LivePrice id={r.inst.id} />
}

/** How far the market is from the alert: a track and the distance, "There now", or where it went off. */
function HowFar({ r, track }: { r: Row; track?: string }) {
  if (r.alert.status === "TRIGGERED") return <span className="num text-[13px] text-ink-3">went off at ₹{formatPrice(r.alert.triggeredPrice, r.inst.tick)}</span>
  if (r.distance == null) return <span className="text-ink-3">–</span>
  if (r.distance <= 0) return <Tag tone="attn">There now</Tag>
  const near = r.distance < 1
  return (
    <span className="inline-flex items-center justify-end gap-3">
      <Track r={r} className={track} />
      <span className={cn("num w-14 text-right", near ? "font-semibold text-attn" : "text-ink-2")}>
        {isPercent(r.alert.condition) ? `${formatNumber(r.distance, 2)} pts` : `${formatNumber(r.distance, 1)}%`}
      </span>
    </span>
  )
}

function StatusCell({ r, onToggle }: { r: Row; onToggle: (a: Alert, on: boolean) => void }) {
  if (r.alert.status === "TRIGGERED") {
    return (
      <Tag tone="attn" icon={BellRing}>
        Went off {r.alert.triggeredAt && formatDateIST(r.alert.triggeredAt, "short")}
      </Tag>
    )
  }
  return (
    <span className="inline-flex items-center gap-2">
      <Switch
        size="sm"
        checked={r.alert.status === "ACTIVE"}
        onCheckedChange={(on) => onToggle(r.alert, on)}
        aria-label={`${r.alert.status === "ACTIVE" ? "Pause" : "Resume"} alert on ${r.inst.symbol}`}
      />
      <span className="text-[13px] text-ink-3">{r.alert.status === "ACTIVE" ? "Watching" : "Paused"}</span>
    </span>
  )
}

function Actions({ r, onRearm, onDelete }: { r: Row; onRearm: (a: Alert) => void; onDelete: (r: Row) => void }) {
  return (
    <span className="inline-flex gap-0.5">
      {r.alert.status === "TRIGGERED" && (
        <Button variant="ghost" size="sm" onClick={() => onRearm(r.alert)}>
          Re-arm
        </Button>
      )}
      <Button variant="ghost" size="icon-sm" aria-label={`Delete alert on ${r.inst.symbol}`} onClick={() => onDelete(r)}>
        <Trash2 />
      </Button>
    </span>
  )
}

export function AlertsView() {
  const { mode } = useMarket()
  const alerts = useAlerts((s) => s.alerts)
  const update = useAlerts((s) => s.update)
  const remove = useAlerts((s) => s.remove)
  const read = useQuoteReader(1000)
  const [filter, setFilter] = useState<Filter>("ALL")
  const [creating, setCreating] = useState<number | null>(null)

  const rows = useMemo<Row[]>(() => {
    return alerts
      .map((alert) => {
        const inst = getInstrument(alert.instrumentId)!
        const q = read(alert.instrumentId)
        return { alert, inst, q, distance: alert.status === "ACTIVE" ? distanceOf(alert, q) : undefined }
      })
      .filter((r) => r.inst && (filter === "ALL" || r.alert.status === filter))
  }, [alerts, filter, read])

  const counts = useMemo(
    () => ({
      active: alerts.filter((a) => a.status === "ACTIVE").length,
      triggered: alerts.filter((a) => a.status === "TRIGGERED").length,
      paused: alerts.filter((a) => a.status === "PAUSED").length,
    }),
    [alerts],
  )
  const recent = useMemo(
    () =>
      alerts
        .filter((a) => a.triggeredAt)
        .sort((a, b) => b.triggeredAt!.getTime() - a.triggeredAt!.getTime())
        .slice(0, 6),
    [alerts],
  )

  const toggle = useCallback((a: Alert, on: boolean) => update(a.id, { status: on ? "ACTIVE" : "PAUSED" }), [update])
  const rearm = useCallback((a: Alert) => update(a.id, { status: "ACTIVE", triggeredAt: undefined, triggeredPrice: undefined }), [update])
  const drop = useCallback(
    (r: Row) => {
      const before = useAlerts.getState().alerts
      remove(r.alert.id)
      toast(`Deleted alert on ${r.inst.symbol}`, { action: { label: "Undo", onClick: () => useAlerts.setState({ alerts: before }) } })
    },
    [remove],
  )

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      { id: "instrument", header: "Name", accessorFn: (r) => r.inst.name, meta: { sticky: true }, cell: ({ row: { original: r } }) => <NameCell r={r} /> },
      { id: "condition", header: "When", accessorFn: (r) => r.alert.condition, cell: ({ row: { original: r } }) => <WhenCell r={r} /> },
      { id: "now", header: "Now", accessorFn: (r) => r.q?.changePct ?? 0, meta: { align: "right" }, cell: ({ row: { original: r } }) => <NowCell r={r} /> },
      {
        id: "distance",
        header: "How far",
        accessorFn: (r) => (r.distance == null ? Number.POSITIVE_INFINITY : r.distance),
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <HowFar r={r} />,
      },
      { id: "status", header: "Status", accessorFn: (r) => r.alert.status, cell: ({ row: { original: r } }) => <StatusCell r={r} onToggle={toggle} /> },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <Actions r={r} onRearm={rearm} onDelete={drop} />,
      },
    ],
    [toggle, rearm, drop],
  )

  const watching = rows.length && filter === "ALL" ? rows.filter((r) => r.alert.status === "ACTIVE" && r.distance != null) : []
  const nearest = [...watching].sort((a, b) => (a.distance ?? Infinity) - (b.distance ?? Infinity))[0]
  const last = recent[0]
  const lastInst = last && getInstrument(last.instrumentId)
  const lede =
    alerts.length === 0
      ? "No alerts yet: pick a company, index or commodity, and a price or a day's move to watch for"
      : [
          `${counts.active} watching`,
          nearest && nearest.distance! > 0
            ? `nearest: ${nearest.inst.name}, ${isPercent(nearest.alert.condition) ? `${formatNumber(nearest.distance!, 2)} points` : `${formatNumber(nearest.distance!, 1)}%`} away`
            : "",
          last && lastInst ? `last went off: ${lastInst.name}` : "",
        ]
          .filter(Boolean)
          .join(" · ")

  return (
    <div>
      <PageHead
        title="Alerts"
        lede={lede}
        actions={
          <InstrumentPicker
            onSelect={(inst) => setCreating(inst.id)}
            trigger={
              <Button>
                <Plus /> New alert
              </Button>
            }
          />
        }
      />

      <Figures className="mt-5 lg:grid-cols-4">
        <Figure label="Watching" value={String(counts.active)} hint="Checked on every price" />
        <Figure label="Went off" value={String(counts.triggered)} hint="Waiting to be re-armed" delta={counts.triggered > 0 ? <Tag tone="attn">New</Tag> : undefined} />
        <Figure label="Paused" value={String(counts.paused)} hint="Not checked" />
        <Figure label="Allowed" value={`${alerts.length} of 100`} hint="Alerts per person" />
      </Figures>

      <div className="mt-5 grid grid-cols-[minmax(0,1fr)] gap-5 xl:grid-cols-[minmax(0,1fr)_18rem]">
        <Section
          title="Your alerts"
          action={
            <Segmented
              value={filter}
              onChange={setFilter}
              options={[
                { value: "ALL", label: "All" },
                { value: "ACTIVE", label: "Watching" },
                { value: "TRIGGERED", label: "Went off" },
                { value: "PAUSED", label: "Paused" },
              ]}
              aria-label="Show"
            />
          }
        >
          <div className="hidden md:block">
            <DataTable
              columns={columns}
              data={rows}
              getRowId={(r) => r.alert.id}
              empty={filter === "ALL" ? "No alerts yet. Use New alert to set one." : "No alerts here."}
            />
          </div>
          {/* On a phone, each alert as a small card: the table's columns would run off the side. */}
          <ul className="-my-1 divide-y divide-rule md:hidden">
            {rows.length === 0 && <li className="py-8 text-center text-sm text-ink-2">{filter === "ALL" ? "No alerts yet. Use New alert to set one." : "No alerts here."}</li>}
            {rows.map((r) => (
              <li key={r.alert.id} className="space-y-2 py-3">
                <div className="flex items-center justify-between gap-3">
                  <NameCell r={r} />
                  <StatusCell r={r} onToggle={toggle} />
                </div>
                <div className="pl-[38px]">
                  <WhenCell r={r} />
                </div>
                <div className="flex items-center justify-between gap-3 pl-[38px]">
                  <HowFar r={r} track="w-24" />
                  <span className="flex items-center gap-1">
                    <NowCell r={r} />
                    <Actions r={r} onRearm={rearm} onDelete={drop} />
                  </span>
                </div>
              </li>
            ))}
          </ul>
        </Section>

        <div className="space-y-5">
          <Section title="Recently went off">
            {recent.length === 0 ? (
              <p className="text-sm text-ink-2">Nothing has gone off yet.</p>
            ) : (
              <ol className="relative ml-1.5 border-l-2 border-rule">
                {recent.map((a, i) => {
                  const inst = getInstrument(a.instrumentId)!
                  return (
                    <li key={a.id} className="relative pb-4 pl-5 last:pb-0">
                      <span
                        className={cn("absolute top-1 -left-[7px] size-3 rounded-full border-2 border-paper", i === 0 ? "bg-attn" : "bg-rule-strong")}
                        aria-hidden="true"
                      />
                      <p className="text-sm leading-snug">
                        <span className="font-semibold">{inst.name}</span>, {waitingFor(a, inst)}
                      </p>
                      <p className="num mt-0.5 text-xs text-ink-3">
                        ₹{formatPrice(a.triggeredPrice, inst.tick)} · {formatDateIST(a.triggeredAt!, "short")}, {formatTimeIST(a.triggeredAt!)}
                      </p>
                    </li>
                  )
                })}
              </ol>
            )}
          </Section>
          <Section
            title="How they reach you"
            description={
              mode === "live"
                ? "The alert engine checks alerts on the server against every price, and each one fires exactly once. A sound can go with them: turn it on in your account."
                : "In the demo, this browser checks your alerts against the simulated prices. A sound can go with them: turn it on in your account."
            }
          >
            <dl className="-my-2 divide-y divide-rule text-sm">
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt>
                  <span className="block font-medium">In the app</span>
                  <span className="block text-xs text-ink-3">A note on whatever page you&apos;re on</span>
                </dt>
                <dd>
                  <Tag tone="up">On</Tag>
                </dd>
              </div>
              <div className="flex items-center justify-between gap-3 py-2.5">
                <dt>
                  <span className="block font-medium">Email and Telegram</span>
                  <span className="block text-xs text-ink-3">Planned, not built yet</span>
                </dt>
                <dd>
                  <Tag>Off</Tag>
                </dd>
              </div>
            </dl>
          </Section>
        </div>
      </div>

      {creating != null && (
        <AlertDialogButton key={creating} instrumentId={creating} trigger={null} open onOpenChange={(o) => !o && setCreating(null)} />
      )}
    </div>
  )
}
