"use client"

import { useState } from "react"
import { ChevronDown } from "lucide-react"
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { COMMODITIES, EQUITIES, INDICES, getInstrument } from "@greencircuits/market/catalog"
import { formatNumber } from "@greencircuits/market/format"
import type { Instrument, InstrumentKind } from "@greencircuits/market/types"
import { cn } from "@/lib/utils"

/**
 * Fields that sit inside a sentence ("Invest ₹10,000 every month in the
 * Nifty 50"), so the form reads like the plan it describes.
 */

export const sentence = "text-[1.0625rem] leading-[2.75] text-ink"

const pill =
  "inline-flex h-9 items-center gap-1 rounded-md border border-rule bg-card px-2.5 align-middle text-[0.9375rem] leading-none font-medium text-ink transition-colors hover:border-ink-3/60 focus-within:border-ink-2 focus-within:ring-2 focus-within:ring-ring/25"

const widthFor = (text: string) => ({ width: `${Math.max(2, text.length) + 0.5}ch` })

/** Rupees, shown with Indian digit grouping. */
export function MoneyField({ value, onChange, label }: { value: number; onChange: (v: number) => void; label: string }) {
  const [editing, setEditing] = useState<string | null>(null)
  const shown = editing ?? formatNumber(value, 0)
  return (
    <span className={pill}>
      <span className="text-ink-3" aria-hidden="true">
        ₹
      </span>
      <input
        aria-label={label}
        inputMode="numeric"
        autoComplete="off"
        className="num bg-transparent outline-none"
        style={widthFor(shown)}
        value={shown}
        onFocus={() => setEditing(formatNumber(value, 0))}
        onBlur={() => setEditing(null)}
        onChange={(e) => {
          const digits = e.target.value.replace(/[^0-9]/g, "").slice(0, 11)
          const n = digits ? Number(digits) : 0
          setEditing(digits ? formatNumber(n, 0) : "")
          onChange(n)
        }}
      />
    </span>
  )
}

/** A plain number with an optional unit: 10 %, 60 days, 5 bps. */
export function NumberField({
  value,
  onChange,
  label,
  suffix,
  decimals = 0,
}: {
  value: number
  onChange: (v: number) => void
  label: string
  suffix?: string
  decimals?: number
}) {
  const [editing, setEditing] = useState<string | null>(null)
  const shown = editing ?? String(Number(value.toFixed(decimals)))
  return (
    <span className={pill}>
      <input
        aria-label={label}
        inputMode={decimals ? "decimal" : "numeric"}
        autoComplete="off"
        className="num bg-transparent text-right outline-none"
        style={widthFor(shown)}
        value={shown}
        onFocus={() => setEditing(String(Number(value.toFixed(decimals))))}
        onBlur={() => setEditing(null)}
        onChange={(e) => {
          const text = e.target.value.replace(decimals ? /[^0-9.]/g : /[^0-9]/g, "").slice(0, 8)
          setEditing(text)
          const n = Number(text)
          if (text !== "" && Number.isFinite(n)) onChange(n)
        }}
      />
      {suffix && (
        <span className="text-ink-3" aria-hidden="true">
          {suffix}
        </span>
      )}
    </span>
  )
}

/** A native select, for short fixed choices. */
export function SelectField<T extends string>({
  value,
  onChange,
  options,
  label,
}: {
  value: T
  onChange: (v: T) => void
  options: readonly { value: T; label: string }[]
  label: string
}) {
  return (
    <span className={cn(pill, "relative pr-7")}>
      <select aria-label={label} value={value} onChange={(e) => onChange(e.target.value as T)} className="cursor-pointer appearance-none bg-transparent outline-none">
        {options.map((o) => (
          <option key={o.value} value={o.value}>
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute right-2 size-3.5 text-ink-3" aria-hidden="true" />
    </span>
  )
}

export function DateField({ value, onChange, label, min, max }: { value: string; onChange: (v: string) => void; label: string; min?: string; max?: string }) {
  return (
    <span className={pill}>
      <input type="date" aria-label={label} value={value} min={min} max={max} onChange={(e) => onChange(e.target.value)} className="num bg-transparent outline-none" />
    </span>
  )
}

const GROUPS: { kind: InstrumentKind; label: string; items: Instrument[] }[] = [
  { kind: "INDEX", label: "Indices", items: INDICES.filter((i) => i.symbol !== "INDIA VIX") },
  { kind: "EQUITY", label: "Stocks", items: EQUITIES },
  { kind: "COMMODITY", label: "Commodities", items: COMMODITIES },
]

/** Searchable list of instruments, for a popover. */
export function InstrumentCommand({
  kinds,
  selected,
  onPick,
}: {
  kinds: InstrumentKind[]
  selected: number[]
  onPick: (id: number) => void
}) {
  return (
    <Command>
      <CommandInput placeholder="Search by name or symbol" />
      <CommandList className="max-h-72">
        <CommandEmpty>Nothing matches.</CommandEmpty>
        {GROUPS.filter((g) => kinds.includes(g.kind)).map((g) => (
          <CommandGroup key={g.kind} heading={g.label}>
            {g.items.map((i) => (
              <CommandItem key={i.id} value={`${i.name} ${i.symbol}`} data-checked={selected.includes(i.id)} onSelect={() => onPick(i.id)} className="text-[0.8125rem]">
                <span className="truncate">{i.name}</span>
                <span className="ml-auto pl-3 text-[0.6875rem] text-ink-3">{i.symbol}</span>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </Command>
  )
}

/** One instrument, picked from a searchable list. */
export function InstrumentField({
  value,
  onChange,
  label,
  kinds = ["INDEX", "EQUITY", "COMMODITY"],
}: {
  value: number
  onChange: (id: number) => void
  label: string
  kinds?: InstrumentKind[]
}) {
  const [open, setOpen] = useState(false)
  const inst = getInstrument(value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button type="button" aria-label={`${label}: ${inst?.name ?? "none"}`} className={cn(pill, "cursor-pointer")}>
          {inst?.kind === "INDEX" && <span className="font-normal text-ink-2">the</span>}
          {inst?.name ?? "Choose"}
          <ChevronDown className="size-3.5 text-ink-3" aria-hidden="true" />
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0" align="start">
        <InstrumentCommand
          kinds={kinds}
          selected={[value]}
          onPick={(id) => {
            onChange(id)
            setOpen(false)
          }}
        />
      </PopoverContent>
    </Popover>
  )
}
