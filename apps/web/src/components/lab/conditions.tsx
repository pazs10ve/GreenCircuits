"use client"

import { useState } from "react"
import { Plus, X } from "lucide-react"
import type { Condition, Operand } from "@greencircuits/contracts/strategy"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { EQUITIES, getInstrument } from "@greencircuits/market/catalog"
import { OPERAND_KINDS, OPS } from "@/lib/lab/describe"
import { LARGEST_TEN } from "@/lib/lab/templates"
import { InstrumentCommand, NumberField, SelectField } from "./fields"

/** Sensible starting points when someone switches an operand to a new kind. */
const DEFAULT_PERIOD: Record<string, number> = { sma: 50, ema: 20, rsi: 14, high: 250, low: 20 }

function withKind(kind: Operand["kind"], previous: Operand): Operand {
  if (kind === "price") return { kind }
  if (kind === "value") return { kind, value: previous.kind === "value" ? previous.value : 30 }
  return { kind, period: "period" in previous ? previous.period : DEFAULT_PERIOD[kind]! }
}

const KIND_OPTIONS = OPERAND_KINDS.map((k) => ({ value: k.kind, label: k.label }))
const OP_OPTIONS = OPS.map((o) => ({ value: o.op, label: o.label }))

function OperandInput({ operand, onChange, side }: { operand: Operand; onChange: (o: Operand) => void; side: "left" | "right" }) {
  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <SelectField
        label={`${side === "left" ? "First" : "Second"} value`}
        value={operand.kind}
        options={side === "left" ? KIND_OPTIONS.filter((o) => o.value !== "value") : KIND_OPTIONS}
        onChange={(kind) => onChange(withKind(kind, operand))}
      />
      {operand.kind === "value" && (
        <NumberField label="Number" value={operand.value} decimals={2} onChange={(value) => onChange({ kind: "value", value })} />
      )}
      {"period" in operand && (
        <>
          <span className="text-ink-2">of</span>
          <NumberField label="Days" value={operand.period} suffix="days" onChange={(period) => onChange({ ...operand, period })} />
        </>
      )}
    </span>
  )
}

/** A list of conditions like "RSI of 14 days crosses below 30". */
export function ConditionList({
  conditions,
  onChange,
  addLabel = "Add a condition",
}: {
  conditions: Condition[]
  onChange: (next: Condition[]) => void
  addLabel?: string
}) {
  const set = (i: number, c: Condition) => onChange(conditions.map((x, k) => (k === i ? c : x)))
  return (
    <div className="space-y-3">
      <ol className="space-y-3">
        {conditions.map((c, i) => (
          <li key={i} className="flex flex-wrap items-center gap-x-2 gap-y-2 border-l-2 border-rule pl-3">
            <OperandInput side="left" operand={c.left} onChange={(left) => set(i, { ...c, left })} />
            <SelectField label="Comparison" value={c.op} options={OP_OPTIONS} onChange={(op) => set(i, { ...c, op })} />
            <OperandInput side="right" operand={c.right} onChange={(right) => set(i, { ...c, right })} />
            {conditions.length > 1 && (
              <button
                type="button"
                onClick={() => onChange(conditions.filter((_, k) => k !== i))}
                className="ml-1 rounded-md p-1.5 text-ink-3 hover:bg-surface hover:text-ink"
                aria-label="Remove this condition"
              >
                <X className="size-4" />
              </button>
            )}
          </li>
        ))}
      </ol>
      {conditions.length < 8 && (
        <button
          type="button"
          onClick={() => onChange([...conditions, { left: { kind: "price" }, op: ">", right: { kind: "sma", period: 50 } }])}
          className="link inline-flex items-center gap-1 text-sm font-medium"
        >
          <Plus className="size-3.5" aria-hidden="true" /> {addLabel}
        </button>
      )}
    </div>
  )
}

const SETS: { label: string; ids: () => number[] }[] = [
  { label: "The 10 largest", ids: () => LARGEST_TEN },
  { label: "Banks", ids: () => EQUITIES.filter((i) => i.industry?.includes("Bank")).map((i) => i.id) },
  { label: "IT companies", ids: () => EQUITIES.filter((i) => i.sector === "IT").map((i) => i.id) },
  { label: "All Nifty 50 stocks", ids: () => EQUITIES.map((i) => i.id) },
]

/** The stocks (or indices) a set of rules trades. */
export function UniversePicker({ ids, onChange }: { ids: number[]; onChange: (ids: number[]) => void }) {
  const [open, setOpen] = useState(false)
  const toggle = (id: number) => onChange(ids.includes(id) ? ids.filter((x) => x !== id) : [...ids, id].slice(0, 50))
  return (
    <div className="space-y-3">
      <ul className="flex flex-wrap gap-2" aria-label="Instruments to trade">
        {ids.map((id) => (
          <li key={id} className="inline-flex h-8 items-center gap-1 rounded-md bg-surface pr-1 pl-2.5 text-sm font-medium">
            {getInstrument(id)?.name ?? id}
            <button type="button" onClick={() => toggle(id)} className="rounded p-1 text-ink-3 hover:bg-surface-2 hover:text-ink" aria-label={`Remove ${getInstrument(id)?.name}`}>
              <X className="size-3.5" />
            </button>
          </li>
        ))}
        <li>
          <Popover open={open} onOpenChange={setOpen}>
            <PopoverTrigger asChild>
              <button type="button" className="inline-flex h-8 items-center gap-1 rounded-md border border-dashed border-ink-3/60 px-2.5 text-sm text-ink-2 hover:border-ink-2 hover:text-ink">
                <Plus className="size-3.5" aria-hidden="true" /> Add
              </button>
            </PopoverTrigger>
            <PopoverContent className="w-80 p-0" align="start">
              <InstrumentCommand kinds={["EQUITY", "INDEX"]} selected={ids} onPick={toggle} />
            </PopoverContent>
          </Popover>
        </li>
      </ul>
      <p className="text-sm text-ink-2">
        Or use a set:{" "}
        {SETS.map((s, i) => (
          <span key={s.label}>
            {i > 0 && <span aria-hidden="true"> · </span>}
            <button type="button" className="link" onClick={() => onChange(s.ids())}>
              {s.label}
            </button>
          </span>
        ))}
      </p>
    </div>
  )
}
