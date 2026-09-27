"use client"

import Link from "next/link"
import { EQUITIES, getInstrument } from "@greencircuits/market/catalog"
import { UNDERLYINGS, UNIVERSES, WEEKLY_UNDERLYINGS, costsFor, expiryWeekday, type Draft, type Style, type UniverseKind } from "@/lib/lab/draft"
import type { Validation } from "@/lib/lab/validate"
import { useWatchlists } from "@/lib/stores/watchlists"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Textarea } from "@/components/ui/textarea"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Segmented } from "@/components/market/segmented"
import { LiveChange, LivePrice } from "@/components/market/price"
import { InstrumentPicker } from "../instrument-picker"
import { BuilderSection, ToggleRow } from "./fields"

type Update = (fn: (d: Draft) => Draft) => void

function issuesFor(v: Validation, section: string) {
  return { errors: v.errors.filter((c) => c.section === section), warnings: v.warnings.filter((c) => c.section === section) }
}

export function BasicsSection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  const setStyle = (style: Style) =>
    update((d) => ({
      ...d,
      style,
      interval: style === "OPTIONS" && d.interval === "1d" ? "5m" : d.interval,
      costs: d.costs.preset === "fno" || style === "OPTIONS" ? costsFor("fno", style) : d.costs,
    }))
  return (
    <BuilderSection id="builder-basics" step={1} title="Basics" description="Name, notes and the kind of strategy" issues={issuesFor(validation, "basics")}>
      <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_auto]">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="s-name" className="text-[11px] text-muted-foreground">
            Name
          </FieldLabel>
          <Input id="s-name" value={draft.name} maxLength={80} onChange={(e) => update((d) => ({ ...d, name: e.target.value }))} aria-invalid={!draft.name.trim() || undefined} />
        </Field>
        <Field className="gap-1.5">
          <span className="text-[11px] font-medium text-muted-foreground" id="s-style-label">
            Style
          </span>
          <Segmented
            value={draft.style}
            onChange={setStyle}
            options={[
              { value: "RULES", label: "Rules" },
              { value: "OPTIONS", label: "Options" },
            ]}
            aria-label="Strategy style"
            className="[&>*]:h-7 [&>*]:px-3"
          />
        </Field>
        <Field className="gap-1.5 md:col-span-2">
          <FieldLabel htmlFor="s-desc" className="text-[11px] text-muted-foreground">
            Description
          </FieldLabel>
          <Textarea
            id="s-desc"
            value={draft.description}
            maxLength={280}
            onChange={(e) => update((d) => ({ ...d, description: e.target.value }))}
            placeholder="What the strategy is trying to capture, in a sentence"
            className="min-h-14"
          />
          <FieldDescription className="text-[11px]">
            {draft.style === "OPTIONS"
              ? "Options strategies pick legs by moneyness or delta around a timed entry."
              : "Rules strategies buy when entry conditions hold on a bar's close and exit on stops, targets or signals."}
          </FieldDescription>
        </Field>
      </div>
    </BuilderSection>
  )
}

const KINDS: { value: UniverseKind; label: string }[] = [
  { value: "symbol", label: "One symbol" },
  { value: "index", label: "Index members" },
  { value: "watchlist", label: "Watchlist" },
  { value: "screen", label: "Screen" },
]

export function UniverseSection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  const lists = useWatchlists((s) => s.lists)
  const u = draft.universe
  const setU = (patch: Partial<Draft["universe"]>) => update((d) => ({ ...d, universe: { ...d.universe, ...patch } }))
  const setO = (patch: Partial<Draft["options"]>) => update((d) => ({ ...d, options: { ...d.options, ...patch } }))
  const issues = issuesFor(validation, "universe")

  if (draft.style === "OPTIONS") {
    const o = draft.options
    const inst = getInstrument(o.underlyingId)
    return (
      <BuilderSection id="builder-universe" step={2} title="Underlying" description="Index options, with contract specs as they were on each date" issues={issues}>
        <div className="grid gap-4 sm:grid-cols-2">
          <Field className="gap-1.5">
            <FieldLabel htmlFor="s-underlying" className="text-[11px] text-muted-foreground">
              Underlying
            </FieldLabel>
            <Select value={String(o.underlyingId)} onValueChange={(v) => setO({ underlyingId: Number(v), expiry: WEEKLY_UNDERLYINGS.includes(Number(v)) ? o.expiry : "monthly" })}>
              <SelectTrigger id="s-underlying" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent position="popper">
                {UNDERLYINGS.map((id) => {
                  const i = getInstrument(id)!
                  return (
                    <SelectItem key={id} value={String(id)}>
                      {i.symbol} · lot {i.lot}
                    </SelectItem>
                  )
                })}
              </SelectContent>
            </Select>
            <FieldDescription className="flex items-center gap-1.5 text-[11px]">
              Now <LivePrice id={o.underlyingId} className="text-foreground" /> <LiveChange id={o.underlyingId} showAbsolute={false} />
            </FieldDescription>
          </Field>
          <Field className="gap-1.5">
            <span className="text-[11px] font-medium text-muted-foreground">Expiry</span>
            <Segmented
              value={o.expiry}
              onChange={(expiry) => setO({ expiry, daysToExpiry: expiry === "weekly" ? Math.min(o.daysToExpiry, 4) : o.daysToExpiry })}
              options={[
                { value: "weekly", label: "Weekly" },
                { value: "monthly", label: "Monthly" },
              ]}
              aria-label="Expiry cycle"
              className="[&>*]:h-7 [&>*]:px-3"
            />
            <FieldDescription className="text-[11px]">
              {WEEKLY_UNDERLYINGS.includes(o.underlyingId)
                ? `${inst?.symbol} weeklies expire on ${expiryWeekday(o.underlyingId)}; each contract carries its real expiry date.`
                : `${inst?.symbol} lists monthly expiries only since November 2024.`}
            </FieldDescription>
          </Field>
        </div>
      </BuilderSection>
    )
  }

  const list = lists.find((l) => l.id === u.watchlistId) ?? lists[0]
  return (
    <BuilderSection id="builder-universe" step={2} title="Universe" description="What the strategy may trade" issues={issues}>
      <div className="space-y-4">
        <Segmented value={u.kind} onChange={(kind) => setU({ kind })} options={KINDS} aria-label="Universe type" className="flex-wrap [&>*]:h-7" />
        {u.kind === "symbol" && (
          <Field className="gap-1.5">
            <FieldLabel htmlFor="s-symbol" className="text-[11px] text-muted-foreground">
              Symbol
            </FieldLabel>
            <InstrumentPicker id="s-symbol" value={u.symbolId} onChange={(symbolId) => setU({ symbolId })} groups={[{ heading: "NSE equities", items: EQUITIES }]} />
            <FieldDescription className="flex items-center gap-1.5 text-[11px]">
              Now <LivePrice id={u.symbolId} className="text-foreground" /> <LiveChange id={u.symbolId} showAbsolute={false} />
            </FieldDescription>
          </Field>
        )}
        {u.kind === "index" && (
          <div className="grid gap-3 sm:grid-cols-2">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="s-index" className="text-[11px] text-muted-foreground">
                Index
              </FieldLabel>
              <Select value={u.index} onValueChange={(index) => setU({ index })}>
                <SelectTrigger id="s-index" className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {UNIVERSES.map((x) => (
                    <SelectItem key={x.id} value={x.id}>
                      {x.label} <span className="num text-muted-foreground">· {x.members}</span>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </Field>
            {u.index !== "sectors" ? (
              <ToggleRow
                id="s-pit"
                label="Membership as of each date"
                description="Includes stocks later dropped or delisted, so there is no survivorship bias"
                checked={u.pointInTime}
                onCheckedChange={(pointInTime) => setU({ pointInTime })}
              />
            ) : (
              <p className="self-end text-[11px] text-muted-foreground">Ranks and holds the sector indices themselves, not their members.</p>
            )}
          </div>
        )}
        {u.kind === "watchlist" && (
          <Field className="gap-1.5">
            <FieldLabel htmlFor="s-watchlist" className="text-[11px] text-muted-foreground">
              Watchlist
            </FieldLabel>
            <Select value={list?.id ?? ""} onValueChange={(watchlistId) => setU({ watchlistId })}>
              <SelectTrigger id="s-watchlist" className="w-full sm:w-80">
                <SelectValue placeholder="Choose a watchlist" />
              </SelectTrigger>
              <SelectContent position="popper">
                {lists.map((l) => (
                  <SelectItem key={l.id} value={l.id}>
                    {l.name} <span className="num text-muted-foreground">· {l.ids.length}</span>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <FieldDescription className="text-[11px]">
              {list ? `${list.ids.map((id) => getInstrument(id)?.symbol).filter(Boolean).slice(0, 8).join(", ")}${list.ids.length > 8 ? "…" : ""}` : "No watchlists yet."}{" "}
              <Link href="/watchlists" className="underline underline-offset-2 hover:text-foreground">
                Manage watchlists
              </Link>
            </FieldDescription>
          </Field>
        )}
        {u.kind === "screen" && (
          <Field className="gap-1.5">
            <FieldLabel htmlFor="s-screen" className="text-[11px] text-muted-foreground">
              Screener query
            </FieldLabel>
            <Input
              id="s-screen"
              value={u.screen}
              onChange={(e) => setU({ screen: e.target.value })}
              spellCheck={false}
              placeholder="roe > 15 and pe < 25 and market_cap > 20000"
              className="font-mono text-[11px] md:text-[11px]"
              aria-invalid={!u.screen.trim() || undefined}
            />
            <FieldDescription className="text-[11px]">
              Re-run on every date with only the data published by then.{" "}
              <Link href="/screener" className="underline underline-offset-2 hover:text-foreground">
                Open the screener
              </Link>
            </FieldDescription>
          </Field>
        )}
      </div>
    </BuilderSection>
  )
}
