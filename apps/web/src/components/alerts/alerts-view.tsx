"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import type { ColumnDef } from "@tanstack/react-table"
import { Bell, BellRing, Mail, Plus, Send, Trash2 } from "lucide-react"
import { toast } from "sonner"
import { DataTable } from "@/components/data/data-table"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { InstrumentPicker } from "@/components/market/instrument-picker"
import { LiveChange, LivePrice } from "@/components/market/price"
import { Segmented } from "@/components/market/segmented"
import { Stat } from "@/components/market/stat"
import { Panel } from "@/components/shell/page-header"
import { Button } from "@/components/ui/button"
import { Switch } from "@/components/ui/switch"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { getInstrument } from "@greencircuits/market/catalog"
import type { Instrument, Quote } from "@greencircuits/market/types"
import { formatDateIST, formatNumber, formatPct, formatPrice, formatTimeIST } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useMarket } from "@/lib/stream/market-context"
import { CONDITION_LABEL, isPercent, useAlerts, type Alert, type AlertChannel } from "@/lib/stores/alerts"
import { cn } from "@/lib/utils"

type Filter = "ALL" | "ACTIVE" | "TRIGGERED" | "PAUSED"

const CHANNEL_ICON: Record<AlertChannel, { icon: typeof Bell; label: string }> = {
  IN_APP: { icon: Bell, label: "In-app" },
  EMAIL: { icon: Mail, label: "Email" },
  TELEGRAM: { icon: Send, label: "Telegram" },
}

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

function level(a: Alert, inst: Instrument): string {
  return isPercent(a.condition) ? formatPct(a.value) : `₹${formatPrice(a.value, inst.tick)}`
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

  const columns = useMemo<ColumnDef<Row>[]>(
    () => [
      {
        id: "instrument",
        header: "Instrument",
        accessorFn: (r) => r.inst.symbol,
        cell: ({ row: { original: r } }) => (
          <Link href={`/stocks/${r.inst.slug}`} className="block min-w-28">
            <span className="block text-xs font-medium hover:underline">{r.inst.symbol}</span>
            <span className="block max-w-40 truncate text-[11px] text-muted-foreground">{r.inst.name}</span>
          </Link>
        ),
      },
      {
        id: "condition",
        header: "Condition",
        accessorFn: (r) => r.alert.condition,
        cell: ({ row: { original: r } }) => (
          <span className="block min-w-44">
            <span className="block">
              {CONDITION_LABEL[r.alert.condition]} <span className="num font-medium">{level(r.alert, r.inst)}</span>
            </span>
            {r.alert.note && <span className="block max-w-56 truncate text-[11px] text-muted-foreground">{r.alert.note}</span>}
          </span>
        ),
      },
      {
        id: "now",
        header: "Now",
        accessorFn: (r) => r.q?.changePct ?? 0,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) =>
          isPercent(r.alert.condition) ? <LiveChange id={r.inst.id} showAbsolute={false} /> : <LivePrice id={r.inst.id} />,
      },
      {
        id: "distance",
        header: "To trigger",
        accessorFn: (r) => (r.distance == null ? Number.POSITIVE_INFINITY : r.distance),
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => {
          if (r.alert.status === "TRIGGERED")
            return (
              <span className="num text-[11px] text-muted-foreground">
                at ₹{formatPrice(r.alert.triggeredPrice, r.inst.tick)}
              </span>
            )
          if (r.distance == null) return <span className="text-muted-foreground">–</span>
          if (r.distance <= 0) return <span className="font-medium text-primary">Met</span>
          const near = r.distance < 1
          return (
            <span className={cn("inline-flex items-center gap-2", near && "font-medium text-primary")}>
              <span className="relative hidden h-1 w-12 rounded-full bg-muted sm:inline-block" aria-hidden="true">
                <span
                  className={cn("absolute inset-y-0 left-0 rounded-full", near ? "bg-primary" : "bg-muted-foreground/50")}
                  style={{ width: `${Math.max(4, 100 - Math.min(100, r.distance * 20))}%` }}
                />
              </span>
              {isPercent(r.alert.condition) ? `${formatNumber(r.distance, 2)} pts` : `${formatNumber(r.distance, 2)}%`}
            </span>
          )
        },
      },
      {
        id: "channels",
        header: "Channels",
        enableSorting: false,
        cell: ({ row: { original: r } }) => (
          <span className="flex gap-1.5">
            {r.alert.channels.map((c) => {
              const Icon = CHANNEL_ICON[c].icon
              return (
                <Tooltip key={c}>
                  <TooltipTrigger asChild>
                    <span className="flex size-5 items-center justify-center rounded border bg-background">
                      <Icon className="size-3 text-muted-foreground" aria-label={CHANNEL_ICON[c].label} />
                    </span>
                  </TooltipTrigger>
                  <TooltipContent>{CHANNEL_ICON[c].label}</TooltipContent>
                </Tooltip>
              )
            })}
            {r.alert.repeat && <span className="rounded border px-1 text-[10px] leading-5 text-muted-foreground">Daily</span>}
          </span>
        ),
      },
      {
        id: "status",
        header: "Status",
        accessorFn: (r) => r.alert.status,
        cell: ({ row: { original: r } }) =>
          r.alert.status === "TRIGGERED" ? (
            <span className="inline-flex items-center gap-1.5 text-[11px]">
              <span className="size-1.5 rounded-full bg-primary" />
              Triggered {r.alert.triggeredAt && formatDateIST(r.alert.triggeredAt, "short")}
            </span>
          ) : (
            <span className="inline-flex items-center gap-2">
              <Switch
                size="sm"
                checked={r.alert.status === "ACTIVE"}
                onCheckedChange={(on) => update(r.alert.id, { status: on ? "ACTIVE" : "PAUSED" })}
                aria-label={`${r.alert.status === "ACTIVE" ? "Pause" : "Resume"} alert on ${r.inst.symbol}`}
              />
              <span className="text-[11px] text-muted-foreground">{r.alert.status === "ACTIVE" ? "Active" : "Paused"}</span>
            </span>
          ),
      },
      {
        id: "created",
        header: "Created",
        accessorFn: (r) => r.alert.createdAt.getTime(),
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => <span className="text-muted-foreground">{formatDateIST(r.alert.createdAt, "short")}</span>,
      },
      {
        id: "actions",
        header: () => <span className="sr-only">Actions</span>,
        enableSorting: false,
        meta: { align: "right" },
        cell: ({ row: { original: r } }) => (
          <span className="inline-flex gap-0.5">
            {r.alert.status === "TRIGGERED" && (
              <Button variant="ghost" size="sm" onClick={() => update(r.alert.id, { status: "ACTIVE", triggeredAt: undefined, triggeredPrice: undefined })}>
                Re-arm
              </Button>
            )}
            <Button
              variant="ghost"
              size="icon-sm"
              aria-label={`Delete alert on ${r.inst.symbol}`}
              onClick={() => {
                const before = useAlerts.getState().alerts
                remove(r.alert.id)
                toast(`Deleted alert on ${r.inst.symbol}`, {
                  action: { label: "Undo", onClick: () => useAlerts.setState({ alerts: before }) },
                })
              }}
            >
              <Trash2 />
            </Button>
          </span>
        ),
      },
    ],
    [update, remove],
  )

  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        {[
          { label: "Active", value: counts.active, hint: "Checked on every tick" },
          { label: "Triggered", value: counts.triggered, hint: "Waiting for you to re-arm" },
          { label: "Paused", value: counts.paused, hint: "Not evaluated" },
          { label: "Plan limit", value: `${alerts.length} of 100`, hint: "Pro trial" },
        ].map((s) => (
          <div key={s.label} className="rounded-lg border bg-card p-3">
            <Stat label={s.label} value={s.value} hint={s.hint} size="lg" className="space-y-1.5" />
          </div>
        ))}
      </div>

      <div className="grid gap-4 2xl:grid-cols-[minmax(0,1fr)_320px]">
        <Panel
          title="Your alerts"
          actions={
            <>
              <Segmented
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "ALL", label: "All" },
                  { value: "ACTIVE", label: "Active" },
                  { value: "TRIGGERED", label: "Triggered" },
                  { value: "PAUSED", label: "Paused" },
                ]}
                aria-label="Filter alerts"
                className="hidden sm:flex"
              />
              <InstrumentPicker
                onSelect={(inst) => setCreating(inst.id)}
                trigger={
                  <Button size="lg">
                    <Plus /> New alert
                  </Button>
                }
              />
            </>
          }
        >
          <DataTable
            columns={columns}
            data={rows}
            getRowId={(r) => r.alert.id}
            empty={filter === "ALL" ? "No alerts yet. Pick an instrument to create one." : "No alerts in this state."}
          />
        </Panel>

        <div className="grid content-start gap-4 md:grid-cols-2 2xl:grid-cols-1">
          <Panel title="Recently triggered">
            {recent.length === 0 ? (
              <p className="px-4 py-6 text-center text-[12px] text-muted-foreground">Nothing has triggered yet.</p>
            ) : (
              <ul className="divide-y divide-border/60">
                {recent.map((a) => {
                  const inst = getInstrument(a.instrumentId)!
                  return (
                    <li key={a.id} className="flex gap-2.5 px-4 py-2.5">
                      <BellRing className="mt-0.5 size-3.5 shrink-0 text-primary" />
                      <span className="min-w-0">
                        <span className="block truncate text-xs font-medium">
                          {inst.symbol} · {CONDITION_LABEL[a.condition].toLowerCase()} {level(a, inst)}
                        </span>
                        <span className="num block text-[11px] text-muted-foreground">
                          ₹{formatPrice(a.triggeredPrice, inst.tick)} · {formatDateIST(a.triggeredAt!, "short")} {formatTimeIST(a.triggeredAt!)} IST
                        </span>
                      </span>
                    </li>
                  )
                })}
              </ul>
            )}
          </Panel>
          <Panel title="Delivery">
            <ul className="divide-y divide-border/60 text-xs">
              <li className="flex items-center gap-3 px-4 py-3">
                <Bell className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block font-medium">In-app</span>
                  <span className="block text-[11px] text-muted-foreground">Toasts and the bell menu, on any page</span>
                </span>
                <span className="text-[11px] font-medium text-up">On</span>
              </li>
              <li className="flex items-center gap-3 px-4 py-3">
                <Mail className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block font-medium">Email</span>
                  <span className="block text-[11px] text-muted-foreground">Sent by the alert engine once accounts exist</span>
                </span>
                <span className="text-[11px] text-muted-foreground">Needs account</span>
              </li>
              <li className="flex items-center gap-3 px-4 py-3">
                <Send className="size-4 text-muted-foreground" />
                <span className="flex-1">
                  <span className="block font-medium">Telegram</span>
                  <span className="block text-[11px] text-muted-foreground">Via the GreenCircuits bot, linked from settings</span>
                </span>
                <span className="text-[11px] text-muted-foreground">Needs account</span>
              </li>
            </ul>
            <p className="border-t px-4 py-3 text-[11px] text-muted-foreground">
              {mode === "live"
                ? "The alert engine checks alerts on the server against the price feed; they show up here as they fire."
                : "In the demo, alerts are checked in this browser against the simulated feed."}{" "}
              Turn on a sound in{" "}
              <Link href="/account" className="text-primary hover:underline">
                settings
              </Link>
              .
            </p>
          </Panel>
        </div>
      </div>

      {creating != null && (
        <AlertDialogButton key={creating} instrumentId={creating} trigger={null} open onOpenChange={(o) => !o && setCreating(null)} />
      )}
    </div>
  )
}
