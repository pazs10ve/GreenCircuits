"use client"

import { Plus, Trash2 } from "lucide-react"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import { isDateKey, sessionsBetween, yearsBetween } from "@/lib/lab/dates"
import { STRIKES, lotSize, type Draft, type Interval, type Leg, type LegInstrument } from "@/lib/lab/draft"
import type { Validation } from "@/lib/lab/validate"
import { Button } from "@/components/ui/button"
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Segmented } from "@/components/market/segmented"
import { BuilderSection, InlineNumber, NumberField } from "./fields"
import { RuleBuilder } from "./rule-builder"

type Update = (fn: (d: Draft) => Draft) => void

function issuesFor(v: Validation, section: string) {
  return { errors: v.errors.filter((c) => c.section === section), warnings: v.warnings.filter((c) => c.section === section) }
}

const INTERVALS: { value: Interval; label: string }[] = [
  { value: "1d", label: "Daily" },
  { value: "15m", label: "15 min" },
  { value: "5m", label: "5 min" },
]

function DateField({ id, label, value, onChange, min, max }: { id: string; label: string; value: string; onChange: (v: string) => void; min?: string; max?: string }) {
  return (
    <Field className="gap-1.5">
      <FieldLabel htmlFor={id} className="text-[11px] text-muted-foreground">
        {label}
      </FieldLabel>
      <Input id={id} type="date" value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className="num" aria-invalid={!isDateKey(value) || undefined} />
    </Field>
  )
}

export function PeriodSection({ draft, update, validation, maxDate }: { draft: Draft; update: Update; validation: Validation; maxDate: string }) {
  const ok = [draft.from, draft.to, draft.split].every(isDateKey) && draft.from < draft.split && draft.split < draft.to
  const total = ok ? yearsBetween(draft.from, draft.to) : 0
  const isYears = ok ? yearsBetween(draft.from, draft.split) : 0
  const oosYears = ok ? yearsBetween(draft.split, draft.to) : 0
  const sessions = ok ? sessionsBetween(draft.from, draft.to) : 0
  return (
    <BuilderSection id="builder-period" step={3} title="Timeframe and period" description="Bar size, test range and the out-of-sample split" issues={issuesFor(validation, "period")}>
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <span className="text-[11px] font-medium text-muted-foreground">Bars</span>
          <Segmented value={draft.interval} onChange={(interval) => update((d) => ({ ...d, interval }))} options={INTERVALS} aria-label="Bar interval" className="[&>*]:h-7 [&>*]:px-3" />
          <span className="text-[11px] text-muted-foreground">
            {draft.interval === "1d" ? "One bar per session, from the NSE bhavcopy" : `${draft.interval === "15m" ? 25 : 75} bars per session, 09:15–15:30 IST`}
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <DateField id="s-from" label="From" value={draft.from} min="2016-01-01" max={maxDate} onChange={(from) => update((d) => ({ ...d, from }))} />
          <DateField id="s-split" label="Out of sample from" value={draft.split} min={draft.from} max={draft.to} onChange={(split) => update((d) => ({ ...d, split }))} />
          <DateField id="s-to" label="To" value={draft.to} min={draft.from} max={maxDate} onChange={(to) => update((d) => ({ ...d, to }))} />
        </div>
        <div className="space-y-1.5" aria-hidden={!ok}>
          <div className="flex h-2 overflow-hidden rounded-full bg-muted">
            <div className="bg-chart-2/70" style={{ width: `${ok ? (isYears / total) * 100 : 0}%` }} />
            <div className="bg-primary/70" style={{ width: `${ok ? (oosYears / total) * 100 : 0}%` }} />
          </div>
          <div className="num flex flex-wrap justify-between gap-x-4 text-[11px] text-muted-foreground">
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-chart-2/70" /> In sample · {formatNumber(isYears, 1)} years for fitting rules
            </span>
            <span className="flex items-center gap-1.5">
              <span className="size-2 rounded-[2px] bg-primary/70" /> Out of sample · {formatNumber(oosYears, 1)} years, reported separately
            </span>
            <span>≈ {formatNumber(sessions, 0)} sessions</span>
          </div>
        </div>
      </div>
    </BuilderSection>
  )
}

let counter = 0
const legId = () => `l${Date.now().toString(36)}${++counter}`

function LegsEditor({ draft, update }: { draft: Draft; update: Update }) {
  const o = draft.options
  const setO = (patch: Partial<Draft["options"]>) => update((d) => ({ ...d, options: { ...d.options, ...patch } }))
  const setLeg = (i: number, patch: Partial<Leg>) => setO({ legs: o.legs.map((l, j) => (j === i ? { ...l, ...patch } : l)) })
  const lot = lotSize(o.underlyingId)
  const symbol = getInstrument(o.underlyingId)?.symbol
  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <Field className="gap-1.5">
          <FieldLabel htmlFor="s-entry-time" className="text-[11px] text-muted-foreground">
            Entry time (IST)
          </FieldLabel>
          <Input id="s-entry-time" type="time" step={300} min="09:15" max="15:25" value={draft.options.entryTime} onChange={(e) => setO({ entryTime: e.target.value })} className="num" />
        </Field>
        <NumberField
          id="s-dte"
          label="Sessions before expiry"
          value={o.daysToExpiry}
          onChange={(daysToExpiry) => setO({ daysToExpiry })}
          min={0}
          hint={o.daysToExpiry === 0 ? "0 = on expiry day" : `${o.daysToExpiry} session${o.daysToExpiry === 1 ? "" : "s"} before expiry`}
        />
        <div className="self-end pb-5 text-[11px] text-muted-foreground">
          1 lot = <span className="num text-foreground">{lot}</span> {symbol}
        </div>
      </div>
      <div className="space-y-1.5">
        <div className="text-[11px] font-medium text-muted-foreground">Legs</div>
        <ol className="space-y-1.5">
          {o.legs.map((leg, i) => (
            <li key={leg.id} className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background/40 p-2">
              <span className="num w-5 text-center font-mono text-[10px] text-muted-foreground">{i + 1}</span>
              <Segmented
                value={leg.action}
                onChange={(action) => setLeg(i, { action })}
                options={[
                  { value: "BUY", label: "Buy" },
                  { value: "SELL", label: "Sell" },
                ]}
                aria-label={`Leg ${i + 1} side`}
              />
              <InlineNumber label={`Leg ${i + 1} lots`} value={leg.lots} onChange={(lots) => setLeg(i, { lots })} min={1} suffix="lot" className="w-20" />
              <Select value={leg.instrument} onValueChange={(v) => setLeg(i, { instrument: v as LegInstrument })}>
                <SelectTrigger aria-label={`Leg ${i + 1} instrument`} className="w-24">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  <SelectItem value="CE">Call (CE)</SelectItem>
                  <SelectItem value="PE">Put (PE)</SelectItem>
                  <SelectItem value="FUT">Future</SelectItem>
                </SelectContent>
              </Select>
              <Select value={leg.strike} onValueChange={(strike) => setLeg(i, { strike })} disabled={leg.instrument === "FUT"}>
                <SelectTrigger aria-label={`Leg ${i + 1} strike`} className="w-28">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent position="popper">
                  {STRIKES.map((s) => (
                    <SelectItem key={s} value={s}>
                      {s}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button
                type="button"
                variant="ghost"
                size="icon-sm"
                className="ml-auto text-muted-foreground"
                aria-label={`Remove leg ${i + 1}`}
                onClick={() => setO({ legs: o.legs.filter((_, j) => j !== i) })}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ol>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={o.legs.length >= 4}
          onClick={() => setO({ legs: [...o.legs, { id: legId(), action: "BUY", instrument: "PE", strike: "OTM 3", lots: 1 }] })}
        >
          <Plus /> Add leg
        </Button>
      </div>
    </div>
  )
}

export function EntrySection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  return (
    <BuilderSection
      id="builder-entry"
      step={4}
      title={draft.style === "OPTIONS" ? "Entry and legs" : "Entry rules"}
      description={draft.style === "OPTIONS" ? "When to open the position and what to trade" : "Conditions evaluated on each bar's close"}
      issues={issuesFor(validation, "entry")}
    >
      {draft.style === "OPTIONS" ? (
        <LegsEditor draft={draft} update={update} />
      ) : (
        <>
          <RuleBuilder join={draft.entry.join} rules={draft.entry.rules} onChange={(entry) => update((d) => ({ ...d, entry }))} />
          <FieldDescription className="mt-3 text-[11px]">
            Signals use data up to and including the bar&apos;s close. Orders fill at the next bar&apos;s open, so a rule can never trade on a price it hasn&apos;t seen.
          </FieldDescription>
        </>
      )}
    </BuilderSection>
  )
}
