"use client"

import { useId } from "react"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Segmented } from "@/components/market/segmented"
import { Stat } from "@/components/market/stat"
import { Panel } from "@/components/shell/page-header"
import { formatNumber, formatPct } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"
import { FREQUENCY_LABEL, YIELD_CAP, YIELD_FLOOR, bondMetrics, rateShocks, yieldFromPrice } from "./bond-math"
import { useBondCalc, type SolveFor } from "./calc-store"

const FREQUENCIES = [2, 1, 4, 12, 0]

function parse(text: string): number | null {
  const trimmed = text.replace(/,/g, "").trim()
  if (trimmed === "") return null
  const v = Number(trimmed)
  return Number.isFinite(v) ? v : null
}

/** Trim a computed number for an input box: 6.900000001 → "6.9". */
const forInput = (v: number, decimals = 4) => String(Number(v.toFixed(decimals)))

/** Clean price from yield or yield from price, with duration and a ±25 bp shock. */
export function BondCalculator({ className }: { className?: string }) {
  const calc = useBondCalc()
  const couponId = useId()
  const ytmId = useId()
  const priceId = useId()
  const yearsId = useId()
  const freqId = useId()

  const zero = calc.frequency === 0
  const coupon = zero ? 0 : parse(calc.coupon)
  const years = parse(calc.years)
  const ytmIn = parse(calc.ytm)
  const priceIn = parse(calc.price)

  const errors: { coupon?: string; ytm?: string; price?: string; years?: string } = {}
  if (coupon == null || coupon < 0 || coupon > 30) errors.coupon = "Enter 0 to 30%."
  if (years == null || years < 0.05 || years > 50) errors.years = "Enter 0.05 to 50 years."
  if (calc.solve === "price" && (ytmIn == null || ytmIn < 0 || ytmIn > 50)) errors.ytm = "Enter 0 to 50%."
  if (calc.solve === "yield" && (priceIn == null || priceIn <= 0 || priceIn > 1000)) errors.price = "Enter a price per ₹100 face."
  const valid = Object.keys(errors).length === 0

  const ytm = !valid ? null : calc.solve === "price" ? ytmIn! : yieldFromPrice(coupon!, priceIn!, years!, calc.frequency)
  const m = ytm != null ? bondMetrics(coupon!, ytm, years!, calc.frequency) : null
  const shocks = ytm != null ? rateShocks(coupon!, ytm, years!, calc.frequency) : []
  const outOfRange = valid && ytm == null

  const switchSolve = (next: SolveFor) => {
    if (next === calc.solve) return
    // Carry the answer over so switching modes doesn't lose the bond.
    if (next === "yield" && m) calc.set({ solve: next, price: forInput(m.price) })
    else if (next === "price" && ytm != null) calc.set({ solve: next, ytm: forInput(ytm) })
    else calc.set({ solve: next })
  }

  return (
    <Panel
      className={className}
      title="Bond calculator"
      description="Per ₹100 face value · clean price, duration, rate shocks"
      actions={
        <Segmented
          value={calc.solve}
          onChange={switchSolve}
          options={[
            { value: "price", label: "Price" },
            { value: "yield", label: "Yield" },
          ]}
          aria-label="Solve for"
        />
      }
      bodyClassName="flex flex-col gap-4 p-4"
    >
      {calc.source && (
        <div className="-mt-1 flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-[11px]">
          <span className="min-w-0 truncate">
            <span className="text-muted-foreground">Loaded </span>
            <span className="font-medium">{calc.source}</span>
          </span>
          <Button variant="ghost" size="xs" onClick={calc.reset}>
            <RotateCcw /> Reset
          </Button>
        </div>
      )}

      <div className="grid grid-cols-2 gap-x-3 gap-y-3">
        <NumberField
          id={couponId}
          label="Coupon, % a year"
          value={zero ? "0" : calc.coupon}
          disabled={zero}
          error={errors.coupon}
          onChange={(v) => calc.set({ coupon: v, source: null })}
        />
        {calc.solve === "price" ? (
          <NumberField id={ytmId} label="Yield to maturity, %" value={calc.ytm} error={errors.ytm} onChange={(v) => calc.set({ ytm: v })} />
        ) : (
          <NumberField id={priceId} label="Clean price, ₹" value={calc.price} error={errors.price} onChange={(v) => calc.set({ price: v })} />
        )}
        <NumberField id={yearsId} label="Years to maturity" value={calc.years} error={errors.years} onChange={(v) => calc.set({ years: v, source: null })} />
        <Field className="gap-1.5">
          <FieldLabel htmlFor={freqId} className="text-[11px] font-normal text-muted-foreground">
            Coupon frequency
          </FieldLabel>
          <Select value={String(calc.frequency)} onValueChange={(v) => calc.set({ frequency: Number(v), source: null })}>
            <SelectTrigger id={freqId} className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {FREQUENCIES.map((f) => (
                <SelectItem key={f} value={String(f)}>
                  {f === 0 ? "Zero coupon (T-Bill)" : FREQUENCY_LABEL[f]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </Field>
      </div>

      <div className="rounded-lg border bg-muted/30 p-3" aria-live="polite">
        {m && ytm != null ? (
          <div className="flex flex-wrap items-end justify-between gap-x-4 gap-y-1">
            <div className="space-y-1">
              <div className="text-[11px] text-muted-foreground">{calc.solve === "price" ? "Clean price" : "Yield to maturity"}</div>
              <div className="num text-2xl leading-none font-semibold tracking-tight">
                {calc.solve === "price" ? `₹${formatNumber(m.price, 2)}` : `${formatNumber(ytm, 2)}%`}
              </div>
            </div>
            <div className="num text-right text-[11px] text-muted-foreground">
              {calc.solve === "price" ? `at ${formatNumber(ytm, 2)}% YTM` : `at ₹${formatNumber(m.price, 2)} clean`}
              <br />
              {zero ? `${Math.round(years! * 365)} days to maturity` : `${m.periods} coupons left`}
            </div>
          </div>
        ) : (
          <p className="py-2 text-xs text-muted-foreground">
            {outOfRange
              ? `That price implies a yield outside ${YIELD_FLOOR}% to ${YIELD_CAP}%. Check the price is per ₹100 face value.`
              : "Fix the highlighted inputs to see the result."}
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-x-4 gap-y-3">
        <Stat label="Macaulay duration" value={m ? `${formatNumber(m.macaulay, 2)} yrs` : "–"} />
        <Stat label="Modified duration" value={m ? formatNumber(m.modified, 2) : "–"} hint="% move per 1% in yield" />
        <Stat
          label="PV01"
          value={m ? `₹${formatNumber(m.pv01, 4)}` : "–"}
          hint={m ? `₹${formatNumber(m.pv01 * 1e5, 0)} per ₹1 Cr face` : undefined}
        />
        <Stat
          label="Current yield"
          value={m ? (m.currentYield == null ? "None" : `${formatNumber(m.currentYield, 2)}%`) : "–"}
          hint={m ? `Convexity ${formatNumber(m.convexity, 1)}` : undefined}
        />
      </div>

      <div>
        <div className="mb-1.5 text-[11px] font-medium">If yields move 25 bp</div>
        <table className="w-full text-xs">
          <thead>
            <tr className="text-[10px] tracking-wide text-muted-foreground uppercase">
              <th scope="col" className="pb-1 text-left font-medium">Yield</th>
              <th scope="col" className="pb-1 text-right font-medium">Price</th>
              <th scope="col" className="pb-1 text-right font-medium">Change</th>
              <th scope="col" className="pb-1 text-right font-medium">Duration est.</th>
            </tr>
          </thead>
          <tbody className="num">
            {shocks.length === 0 && (
              <tr>
                <td colSpan={4} className="border-t py-2 text-muted-foreground">
                  –
                </td>
              </tr>
            )}
            {shocks.map((s) => (
              <tr key={s.bp} className="border-t border-border/60">
                <th scope="row" className="py-1.5 text-left font-normal">
                  {formatNumber(s.yield, 2)}%{" "}
                  <span className="text-muted-foreground">({s.bp > 0 ? "+" : "−"}{Math.abs(s.bp)} bp)</span>
                </th>
                <td className="py-1.5 text-right">{formatNumber(s.price, 2)}</td>
                <td className={cn("py-1.5 text-right", s.changePct >= 0 ? "text-up" : "text-down")}>{formatPct(s.changePct)}</td>
                <td className="py-1.5 text-right text-muted-foreground">{formatPct(s.durationPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
          The gap between the full repricing and the duration estimate is convexity. Prices assume whole coupon periods and no accrued
          interest; T-Bills use the simple discount formula on a 365-day year.
        </p>
      </div>
    </Panel>
  )
}

function NumberField({
  id,
  label,
  value,
  error,
  disabled,
  onChange,
}: {
  id: string
  label: string
  value: string
  error?: string
  disabled?: boolean
  onChange: (value: string) => void
}) {
  return (
    <Field className="gap-1.5" data-invalid={error ? true : undefined}>
      <FieldLabel htmlFor={id} className="text-[11px] font-normal text-muted-foreground">
        {label}
      </FieldLabel>
      <Input
        id={id}
        inputMode="decimal"
        value={value}
        disabled={disabled}
        onChange={(e) => onChange(e.target.value)}
        aria-invalid={error ? true : undefined}
        aria-describedby={error ? `${id}-error` : undefined}
        className="num"
      />
      {error && (
        <p id={`${id}-error`} className="text-[11px] text-destructive">
          {error}
        </p>
      )}
    </Field>
  )
}
