"use client"

import { RotateCcw } from "lucide-react"
import { formatCompact, formatINR, formatNumber } from "@greencircuits/market/format"
import { COST_PRESETS, roundTrip, sameModel, type CostModel } from "@/lib/lab/costs"
import { BENCHMARKS, costsFor, type CostPresetId, type Draft } from "@/lib/lab/draft"
import { costProduct } from "@/lib/lab/dsl"
import type { Validation } from "@/lib/lab/validate"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Segmented } from "@/components/market/segmented"
import { BuilderSection, NumberField } from "./fields"

type Update = (fn: (d: Draft) => Draft) => void

function issuesFor(v: Validation, section: string) {
  return { errors: v.errors.filter((c) => c.section === section), warnings: v.warnings.filter((c) => c.section === section) }
}

const PRESETS: { value: CostPresetId; label: string }[] = [
  { value: "delivery", label: "Zerodha-like delivery" },
  { value: "intraday", label: "Intraday" },
  { value: "fno", label: "F&O" },
]

const FIELDS: { key: keyof CostModel; label: string; prefix?: string; suffix: string; step: number }[] = [
  { key: "brokerageFlat", label: "Brokerage per order", prefix: "₹", suffix: "max", step: 1 },
  { key: "brokeragePct", label: "Brokerage", suffix: "% of value", step: 0.01 },
  { key: "sttBuyPct", label: "STT on buy", suffix: "%", step: 0.005 },
  { key: "sttSellPct", label: "STT on sell", suffix: "%", step: 0.005 },
  { key: "exchangePct", label: "Exchange charges", suffix: "%", step: 0.0001 },
  { key: "sebiPerCrore", label: "SEBI fee", prefix: "₹", suffix: "per crore", step: 1 },
  { key: "stampBuyPct", label: "Stamp duty on buy", suffix: "%", step: 0.001 },
  { key: "gstPct", label: "GST on charges", suffix: "%", step: 1 },
  { key: "slippageBps", label: "Slippage", suffix: "bps per fill", step: 1 },
]

const SAMPLE_TURNOVER = 100_000

export function CostsSection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  const product = costProduct(draft)
  const preset = COST_PRESETS[product]
  const edited = !sameModel(preset.model, draft.costs.model)
  const m = draft.costs.model
  const rt = roundTrip(m, SAMPLE_TURNOVER)
  const setField = (key: keyof CostModel, v: number) => update((d) => ({ ...d, costs: { ...d.costs, model: { ...d.costs.model, [key]: v } } }))
  return (
    <BuilderSection
      id="builder-costs"
      step={7}
      title="Costs"
      description="Indian charges on every fill, plus slippage"
      issues={issuesFor(validation, "costs")}
      actions={
        edited && (
          <Button type="button" variant="ghost" size="sm" onClick={() => update((d) => ({ ...d, costs: costsFor(d.costs.preset, d.style) }))}>
            <RotateCcw /> Reset
          </Button>
        )
      }
    >
      <div className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <Segmented value={draft.costs.preset} onChange={(p) => update((d) => ({ ...d, costs: costsFor(p, d.style) }))} options={PRESETS} aria-label="Cost preset" className="flex-wrap [&>*]:h-7" />
          <span className="text-[11px] text-muted-foreground">
            {preset.label}
            {preset.basis === "premium" && " · STT and exchange charges on premium"}
            {edited && <span className="ml-1.5 rounded-sm bg-muted px-1 py-px text-foreground">edited</span>}
          </span>
        </div>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
          {FIELDS.map((f) => (
            <NumberField
              key={f.key}
              id={`c-${f.key}`}
              label={f.label}
              prefix={f.prefix}
              suffix={f.suffix}
              step={f.step}
              min={0}
              value={m[f.key]}
              onChange={(v) => setField(f.key, v)}
            />
          ))}
        </div>
        <div className="num rounded-md bg-muted/50 px-3 py-2 text-[11px] text-muted-foreground">
          Round trip on {formatINR(SAMPLE_TURNOVER, 0)}
          {preset.basis === "premium" && " of premium"}: charges <span className="text-foreground">{formatINR(rt.charges)}</span> + slippage{" "}
          <span className="text-foreground">{formatINR(rt.slippage)}</span> ={" "}
          <span className="font-medium text-foreground">
            {formatINR(rt.total)} ({formatNumber(rt.pct, 3)}%)
          </span>
          . Brokerage is the lower of the flat fee and the percentage when both are set; GST applies to brokerage, exchange and SEBI charges. DP charges on delivery sells are not included.
        </div>
      </div>
    </BuilderSection>
  )
}

export function CapitalSection({ draft, update, validation }: { draft: Draft; update: Update; validation: Validation }) {
  return (
    <BuilderSection id="builder-capital" step={8} title="Capital and benchmark" description="Starting money and what to compare against" issues={issuesFor(validation, "capital")}>
      <div className="grid gap-3 sm:grid-cols-2">
        <NumberField
          id="k-capital"
          label="Starting capital"
          prefix="₹"
          value={draft.capital}
          onChange={(capital) => update((d) => ({ ...d, capital }))}
          step={100_000}
          min={10_000}
          hint={Number.isFinite(draft.capital) ? `${formatINR(draft.capital, 0)} · ₹${formatCompact(draft.capital)}` : "Enter an amount"}
        />
        <Field className="gap-1.5">
          <FieldLabel htmlFor="k-benchmark" className="text-[11px] text-muted-foreground">
            Benchmark
          </FieldLabel>
          <Select value={draft.benchmark} onValueChange={(benchmark) => update((d) => ({ ...d, benchmark }))}>
            <SelectTrigger id="k-benchmark" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper">
              {BENCHMARKS.map((b) => (
                <SelectItem key={b} value={b}>
                  {b}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Total-return index: dividends reinvested, so the comparison is fair to buy and hold.</p>
        </Field>
      </div>
    </BuilderSection>
  )
}
