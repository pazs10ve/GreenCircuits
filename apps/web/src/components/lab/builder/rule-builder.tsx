"use client"

import { Code, Plus, Trash2 } from "lucide-react"
import {
  COMPARATORS,
  INDICATORS,
  compare,
  operand,
  raw,
  type Band,
  type Comparator,
  type IndicatorId,
  type MacdLine,
  type Operand,
  type OperandKind,
  type PriceField,
  type Rule,
} from "@/lib/lab/draft"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Segmented } from "@/components/market/segmented"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { InlineNumber } from "./fields"

const KINDS = Object.keys(INDICATORS) as IndicatorId[]

function Picker<T extends string>({ value, onChange, options, label, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; label: string; className?: string }) {
  return (
    <Select value={value} onValueChange={(v) => onChange(v as T)}>
      <SelectTrigger size="default" aria-label={label} className={className}>
        <SelectValue />
      </SelectTrigger>
      <SelectContent position="popper">
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  )
}

/** Indicator (or number) with its parameters inline. */
function OperandEditor({ value, onChange, allowNumber, label }: { value: Operand; onChange: (o: Operand) => void; allowNumber: boolean; label: string }) {
  const kinds: { value: OperandKind; label: string }[] = [
    ...(allowNumber ? [{ value: "number" as const, label: "Number" }] : []),
    ...KINDS.map((k) => ({ value: k, label: INDICATORS[k].label })),
  ]
  const set = (patch: Partial<Operand>) => onChange({ ...value, ...patch })
  const params = value.kind === "number" ? [] : INDICATORS[value.kind].params
  return (
    <div className="flex flex-wrap items-center gap-1">
      <Picker
        label={`${label} indicator`}
        value={value.kind}
        onChange={(kind) => onChange(kind === value.kind ? value : operand(kind, kind === "number" ? { value: value.kind === "rsi" ? 30 : 0 } : {}))}
        options={kinds}
        className="w-[124px]"
      />
      {value.kind === "number" && <InlineNumber label={`${label} value`} value={value.value} onChange={(v) => set({ value: v })} step={0.5} className="w-24" />}
      {params.includes("field") && (
        <Picker<PriceField>
          label={`${label} price field`}
          value={value.field}
          onChange={(field) => set({ field })}
          options={(["close", "open", "high", "low"] as const).map((f) => ({ value: f, label: f }))}
          className="w-20"
        />
      )}
      {params.includes("line") && (
        <Picker<MacdLine>
          label={`${label} MACD line`}
          value={value.line}
          onChange={(line) => set({ line })}
          options={[
            { value: "line", label: "MACD line" },
            { value: "signal", label: "Signal" },
            { value: "histogram", label: "Histogram" },
          ]}
          className="w-28"
        />
      )}
      {params.includes("band") && (
        <Picker<Band>
          label={`${label} band`}
          value={value.band}
          onChange={(band) => set({ band })}
          options={[
            { value: "upper", label: "Upper" },
            { value: "middle", label: "Middle" },
            { value: "lower", label: "Lower" },
          ]}
          className="w-24"
        />
      )}
      {params.includes("period") && <InlineNumber label={`${label} period`} value={value.period} onChange={(period) => set({ period })} min={1} className="w-16" />}
      {params.includes("mult") && <InlineNumber label={`${label} multiplier`} value={value.mult} onChange={(mult) => set({ mult })} step={0.5} suffix="×" className="w-16" />}
    </div>
  )
}

/** One condition: indicator, comparator, indicator or number. Or a custom expression. */
export function RuleEditor({ rule, onChange, label, onRemove }: { rule: Rule; onChange: (r: Rule) => void; label: string; onRemove?: () => void }) {
  return (
    <div className="flex flex-wrap items-center gap-1.5 rounded-md border bg-background/40 p-2">
      {rule.kind === "compare" ? (
        <>
          <OperandEditor label={`${label} left`} value={rule.left} allowNumber={false} onChange={(left) => onChange({ ...rule, left })} />
          <Picker<Comparator> label={`${label} comparison`} value={rule.op} onChange={(op) => onChange({ ...rule, op })} options={COMPARATORS} className="w-[118px]" />
          <OperandEditor label={`${label} right`} value={rule.right} allowNumber onChange={(right) => onChange({ ...rule, right })} />
        </>
      ) : (
        <Input
          aria-label={`${label} custom condition`}
          value={rule.text}
          onChange={(e) => onChange({ ...rule, text: e.target.value })}
          spellCheck={false}
          placeholder="e.g. close > max(high, 20)[1]"
          className="min-w-0 flex-1 basis-60 font-mono text-[11px] md:text-[11px]"
          aria-invalid={!rule.text.trim() || undefined}
        />
      )}
      {onRemove && (
        <Button type="button" variant="ghost" size="icon-sm" className="ml-auto text-muted-foreground" aria-label={`Remove ${label.toLowerCase()}`} onClick={onRemove}>
          <Trash2 />
        </Button>
      )}
    </div>
  )
}

let counter = 0
function nextId(prefix: string): string {
  counter += 1
  return `${prefix}${Date.now().toString(36)}${counter}`
}

/** Entry rules joined by AND or OR. */
export function RuleBuilder({
  join,
  rules,
  onChange,
}: {
  join: "and" | "or"
  rules: Rule[]
  onChange: (next: { join: "and" | "or"; rules: Rule[] }) => void
}) {
  const setRule = (i: number, r: Rule) => onChange({ join, rules: rules.map((x, j) => (j === i ? r : x)) })
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <span className="text-muted-foreground">Enter when</span>
        <Segmented
          value={join}
          onChange={(v) => onChange({ join: v, rules })}
          options={[
            { value: "and", label: "all" },
            { value: "or", label: "any" },
          ]}
          aria-label="Combine rules with"
        />
        <span className="text-muted-foreground">of these are true on a bar&apos;s close</span>
      </div>
      <ol className="space-y-1.5">
        {rules.map((r, i) => (
          <li key={r.id} className="flex items-start gap-1.5">
            <span className="num mt-2 w-7 shrink-0 text-right font-mono text-[10px] text-muted-foreground uppercase">{i === 0 ? "if" : join}</span>
            <div className="min-w-0 flex-1">
              <RuleEditor rule={r} label={`Rule ${i + 1}`} onChange={(next) => setRule(i, next)} onRemove={() => onChange({ join, rules: rules.filter((_, j) => j !== i) })} />
            </div>
          </li>
        ))}
      </ol>
      {rules.length === 0 && <p className="rounded-md border border-dashed p-3 text-center text-[11px] text-muted-foreground">No rules yet. Add one to define the entry.</p>}
      <div className="flex flex-wrap gap-2 pl-8">
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={rules.length >= 8}
          onClick={() => onChange({ join, rules: [...rules, compare(nextId("r"), operand("ema", { period: 20 }), ">", operand("sma", { period: 50 }))] })}
        >
          <Plus /> Add rule
        </Button>
        <Button type="button" variant="ghost" size="sm" disabled={rules.length >= 8} onClick={() => onChange({ join, rules: [...rules, raw(nextId("r"), "")] })}>
          <Code /> Custom condition
        </Button>
      </div>
    </div>
  )
}
