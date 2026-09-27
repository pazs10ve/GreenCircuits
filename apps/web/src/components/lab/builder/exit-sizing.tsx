"use client"

import { EQUITIES } from "@greencircuits/market/catalog"
import { formatINR } from "@greencircuits/market/format"
import type { Draft, SizingMode } from "@/lib/lab/draft"
import { operandDsl } from "@/lib/lab/dsl"
import type { Validation } from "@/lib/lab/validate"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/market/segmented"
import { InstrumentPicker } from "../instrument-picker"
import { BuilderSection, InlineNumber, NumberField, ToggleRow } from "./fields"
import { RuleEditor } from "./rule-builder"

type Update = (fn: (d: Draft) => Draft) => void

function issuesFor(v: Validation, section: string) {
  return { errors: v.errors.filter((c) => c.section === section), warnings: v.warnings.filter((c) => c.section === section) }
}

const OPPOSITE = { ">": "<", "<": ">", crosses_above: "crosses_below", crosses_below: "crosses_above" } as const

export function ExitSection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  const e = draft.exit
  const setE = (patch: Partial<Draft["exit"]>) => update((d) => ({ ...d, exit: { ...d.exit, ...patch } }))
  const o = draft.options
  const setO = (patch: Partial<Draft["options"]>) => update((d) => ({ ...d, options: { ...d.options, ...patch } }))
  const first = draft.entry.rules[0]
  const opposite = first?.kind === "compare" ? `${operandDsl(first.left)} ${OPPOSITE[first.op]} ${operandDsl(first.right)}` : "the entry condition turns false"

  if (draft.style === "OPTIONS") {
    return (
      <BuilderSection id="builder-exit" step={5} title="Exit rules" description="Per-leg stops, profit target and a time exit" issues={issuesFor(validation, "exit")}>
        <div className="grid gap-2">
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background/40 px-3 py-2">
            <div className="flex-1 text-xs font-medium">
              Stop per leg
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Close a leg when its premium moves against you by this much</span>
            </div>
            <InlineNumber label="Stop per leg percent" value={o.stopPerLegPct} onChange={(stopPerLegPct) => setO({ stopPerLegPct })} suffix="%" />
          </div>
          <ToggleRow id="x-credit" label="Profit target" description="Close everything at this share of the credit received" checked={o.targetOn} onCheckedChange={(targetOn) => setO({ targetOn })}>
            <InlineNumber label="Target percent of credit" value={o.targetPct} onChange={(targetPct) => setO({ targetPct })} suffix="%" disabled={!o.targetOn} />
          </ToggleRow>
          <ToggleRow id="x-adjust" label="Adjust" description="When one leg's premium doubles, roll the untested leg closer to the money" checked={o.adjust} onCheckedChange={(adjust) => setO({ adjust })} />
          <div className="flex flex-wrap items-center gap-3 rounded-md border bg-background/40 px-3 py-2">
            <label htmlFor="x-exit-time" className="flex-1 text-xs font-medium">
              Time exit
              <span className="mt-0.5 block text-[11px] font-normal text-muted-foreground">Square off whatever is open at this time</span>
            </label>
            <Input id="x-exit-time" type="time" step={300} min="09:20" max="15:30" value={o.exitTime} onChange={(ev) => setO({ exitTime: ev.target.value })} className="num h-7 w-28" />
          </div>
        </div>
      </BuilderSection>
    )
  }

  return (
    <BuilderSection id="builder-exit" step={5} title="Exit rules" description="The first one to trigger closes the trade" issues={issuesFor(validation, "exit")}>
      <div className="grid gap-2">
        <div className="grid gap-2 md:grid-cols-2">
          <ToggleRow id="x-stop" label="Stop-loss" checked={e.stopOn} onCheckedChange={(stopOn) => setE({ stopOn })}>
            <InlineNumber label="Stop-loss percent" value={e.stopPct} onChange={(stopPct) => setE({ stopPct })} step={0.5} suffix="%" disabled={!e.stopOn} />
          </ToggleRow>
          <ToggleRow id="x-target" label="Target" checked={e.targetOn} onCheckedChange={(targetOn) => setE({ targetOn })}>
            <InlineNumber label="Target percent" value={e.targetPct} onChange={(targetPct) => setE({ targetPct })} step={0.5} suffix="%" disabled={!e.targetOn} />
          </ToggleRow>
          <ToggleRow id="x-trail" label="Trailing stop" checked={e.trailOn} onCheckedChange={(trailOn) => setE({ trailOn })}>
            <InlineNumber label="Trailing stop percent" value={e.trailPct} onChange={(trailPct) => setE({ trailPct })} step={0.5} suffix="%" disabled={!e.trailOn} />
          </ToggleRow>
          <ToggleRow id="x-time" label="Time exit" checked={e.timeOn} onCheckedChange={(timeOn) => setE({ timeOn })}>
            <InlineNumber label="Maximum bars held" value={e.maxBars} onChange={(maxBars) => setE({ maxBars })} min={1} suffix="bars" className="w-24" disabled={!e.timeOn} />
          </ToggleRow>
        </div>
        <ToggleRow
          id="x-opposite"
          label="Exit on the opposite signal"
          description={<span className="font-mono text-[10.5px]">{opposite}</span>}
          checked={e.opposite}
          onCheckedChange={(opposite) => setE({ opposite })}
        />
        <ToggleRow id="x-signal" label="Exit signal" description="Any condition, checked on each bar's close" checked={e.signalOn} onCheckedChange={(signalOn) => setE({ signalOn })} />
        {e.signalOn && <RuleEditor rule={e.signal} label="Exit signal" onChange={(signal) => setE({ signal })} />}
        <p className="text-[11px] text-muted-foreground">When one bar touches both the stop and the target, the engine assumes the stop was hit first.</p>
      </div>
    </BuilderSection>
  )
}

const MODES: { value: SizingMode; label: string }[] = [
  { value: "fixed", label: "Fixed ₹" },
  { value: "percent", label: "% of equity" },
  { value: "equal", label: "Equal weight" },
  { value: "risk", label: "Risk %" },
]

export function SizingSection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  const s = draft.sizing
  const setS = (patch: Partial<Draft["sizing"]>) => update((d) => ({ ...d, sizing: { ...d.sizing, ...patch } }))
  if (draft.style === "OPTIONS") {
    const lots = draft.options.legs.reduce((a, l) => a + (Number.isFinite(l.lots) ? l.lots : 0), 0)
    return (
      <BuilderSection id="builder-sizing" step={6} title="Position sizing" description="Set per leg for options" issues={issuesFor(validation, "sizing")}>
        <p className="text-xs text-muted-foreground">
          Size comes from the lots on each leg: <span className="num font-medium text-foreground">{lots}</span> lot{lots === 1 ? "" : "s"} in total. Margin is checked against
          capital at each entry using the SPAN and exposure rates in force on that date; entries that don&apos;t fit are skipped and logged.
        </p>
      </BuilderSection>
    )
  }
  const perTrade =
    s.mode === "fixed" ? s.fixedInr : s.mode === "percent" ? (draft.capital * s.percent) / 100 : s.mode === "equal" ? draft.capital / Math.max(1, s.maxPositions) : NaN
  return (
    <BuilderSection id="builder-sizing" step={6} title="Position sizing" description="How much each trade gets" issues={issuesFor(validation, "sizing")}>
      <div className="space-y-4">
        <Segmented value={s.mode} onChange={(mode) => setS({ mode })} options={MODES} aria-label="Sizing method" className="flex-wrap [&>*]:h-7" />
        <div className="grid gap-3 sm:grid-cols-3">
          {s.mode === "fixed" && <NumberField id="z-fixed" label="Per trade" prefix="₹" value={s.fixedInr} onChange={(fixedInr) => setS({ fixedInr })} step={10_000} min={0} />}
          {s.mode === "percent" && <NumberField id="z-pct" label="Of equity per trade" suffix="%" value={s.percent} onChange={(percent) => setS({ percent })} step={0.5} min={0} />}
          {s.mode === "risk" && (
            <>
              <NumberField id="z-risk" label="Risk per trade" suffix="% of equity" value={s.riskPct} onChange={(riskPct) => setS({ riskPct })} step={0.25} min={0} />
              <NumberField id="z-atr" label="Stop distance" suffix="× ATR(14)" value={s.atrMult} onChange={(atrMult) => setS({ atrMult })} step={0.5} min={0} />
            </>
          )}
          <NumberField id="z-max" label="Max open positions" value={s.maxPositions} onChange={(maxPositions) => setS({ maxPositions })} min={1} />
        </div>
        <p className="num text-[11px] text-muted-foreground">
          {s.mode === "risk"
            ? `Quantity = ${s.riskPct}% of equity ÷ (${s.atrMult} × ATR), so volatile stocks get smaller positions.`
            : `About ${formatINR(perTrade, 0)} per trade at the starting capital.`}
        </p>
        <ToggleRow id="z-hedge" label="Hedge with a short futures leg" description="For pairs and market-neutral ideas" checked={s.hedgeOn} onCheckedChange={(hedgeOn) => setS({ hedgeOn })} />
        {s.hedgeOn && (
          <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_160px]">
            <Field className="gap-1.5">
              <FieldLabel htmlFor="z-hedge-symbol" className="text-[11px] text-muted-foreground">
                Hedge instrument (stock futures)
              </FieldLabel>
              <InstrumentPicker id="z-hedge-symbol" value={s.hedgeSymbolId} onChange={(hedgeSymbolId) => setS({ hedgeSymbolId })} groups={[{ heading: "F&O stocks", items: EQUITIES.filter((x) => x.isFo) }]} />
            </Field>
            <NumberField id="z-hedge-ratio" label="Hedge ratio" suffix="×" value={s.hedgeRatio} onChange={(hedgeRatio) => setS({ hedgeRatio })} step={0.1} min={0} />
          </div>
        )}
      </div>
    </BuilderSection>
  )
}
