"use client"

import { useId } from "react"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Segmented } from "@/components/market/segmented"
import { Figure, Figures } from "@/components/editorial/figures"
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
    <div className={cn("grid gap-x-14 gap-y-10 lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]", className)}>
      <div>
        <Segmented
          value={calc.solve}
          onChange={switchSolve}
          options={[
            { value: "price", label: "Price from yield" },
            { value: "yield", label: "Yield from price" },
          ]}
          aria-label="Work out"
        />
        {calc.source && (
          <p className="mt-4 text-sm text-ink-2">
            Filled in from <span className="font-medium text-ink">{calc.source}</span>.{" "}
            <button type="button" onClick={calc.reset} className="link">
              Start again
            </button>
          </p>
        )}
        <div className="mt-6 grid grid-cols-2 gap-x-4 gap-y-4">
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
            <NumberField id={priceId} label="Price per ₹100, ₹" value={calc.price} error={errors.price} onChange={(v) => calc.set({ price: v })} />
          )}
          <NumberField id={yearsId} label="Years to maturity" value={calc.years} error={errors.years} onChange={(v) => calc.set({ years: v, source: null })} />
          <Field className="gap-1.5">
            <FieldLabel htmlFor={freqId} className="text-[13px] font-normal text-ink-3">
              Interest paid
            </FieldLabel>
            <Select value={String(calc.frequency)} onValueChange={(v) => calc.set({ frequency: Number(v), source: null })}>
              <SelectTrigger id={freqId} className="w-full bg-card">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {FREQUENCIES.map((f) => (
                  <SelectItem key={f} value={String(f)}>
                    {f === 0 ? "None: a discount bill" : FREQUENCY_LABEL[f]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </div>
      </div>

      <div aria-live="polite">
        {m && ytm != null ? (
          <div>
            <p className="text-[13px] text-ink-3">{calc.solve === "price" ? "Price per ₹100 of face value" : "Yield to maturity"}</p>
            <p className="figure mt-1.5 text-[2.75rem] leading-none">{calc.solve === "price" ? `₹${formatNumber(m.price, 2)}` : `${formatNumber(ytm, 2)}%`}</p>
            <p className="num mt-2.5 text-sm text-ink-2">
              {calc.solve === "price" ? `At a ${formatNumber(ytm, 2)}% yield` : `At ₹${formatNumber(m.price, 2)}`}
              {zero ? `, ${Math.round(years! * 365)} days to maturity.` : `, with ${m.periods} interest payments left.`}
            </p>
          </div>
        ) : (
          <p className="text-[0.9375rem] text-ink-2">
            {outOfRange
              ? `That price implies a yield outside ${YIELD_FLOOR}% to ${YIELD_CAP}%. Check it's the price per ₹100 of face value.`
              : "Fix the highlighted boxes to see the answer."}
          </p>
        )}

        <Figures className="mt-8 sm:grid-cols-2 lg:grid-cols-4">
          <Figure label="Macaulay duration" value={m ? `${formatNumber(m.macaulay, 2)} yrs` : "–"} hint="when the money comes back, on average" />
          <Figure label="Modified duration" value={m ? formatNumber(m.modified, 2) : "–"} hint="% price move per point of yield" />
          <Figure label="PV01" value={m ? `₹${formatNumber(m.pv01, 4)}` : "–"} hint={m ? `₹${formatNumber(m.pv01 * 1e5, 0)} per ₹1 crore of face` : undefined} />
          <Figure
            label="Current yield"
            value={m ? (m.currentYield == null ? "None" : `${formatNumber(m.currentYield, 2)}%`) : "–"}
            hint={m ? `convexity ${formatNumber(m.convexity, 1)}` : undefined}
          />
        </Figures>

        <table className="mt-10 w-full text-sm">
          <caption className="mb-2 text-left text-sm font-semibold">If yields move a quarter of a point</caption>
          <thead>
            <tr className="border-b border-ink text-xs text-ink-3">
              <th scope="col" className="pb-2 text-left font-normal">
                Yield
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Price
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Change
              </th>
              <th scope="col" className="pb-2 text-right font-normal">
                Duration&apos;s guess
              </th>
            </tr>
          </thead>
          <tbody className="num">
            {shocks.length === 0 && (
              <tr className="border-b border-rule">
                <td colSpan={4} className="py-2.5 text-ink-3">
                  –
                </td>
              </tr>
            )}
            {shocks.map((s) => (
              <tr key={s.bp} className="border-b border-rule">
                <th scope="row" className="py-2.5 text-left font-normal">
                  {formatNumber(s.yield, 2)}%{" "}
                  <span className="text-ink-3">
                    ({s.bp > 0 ? "+" : "−"}
                    {Math.abs(s.bp)} bp)
                  </span>
                </th>
                <td className="py-2.5 text-right">₹{formatNumber(s.price, 2)}</td>
                <td className={cn("py-2.5 text-right", s.changePct >= 0 ? "text-up" : "text-down")}>{formatPct(s.changePct)}</td>
                <td className="py-2.5 text-right text-ink-3">{formatPct(s.durationPct)}</td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-3 text-sm leading-relaxed text-ink-3">
          The gap between the full repricing and duration&apos;s guess is convexity. Prices assume whole interest periods and no accrued interest; bills use the simple
          discount formula on a 365-day year.
        </p>
      </div>
    </div>
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
      <FieldLabel htmlFor={id} className="text-[13px] font-normal text-ink-3">
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
        className="num bg-card"
      />
      {error && (
        <p id={`${id}-error`} className="text-[13px] text-down">
          {error}
        </p>
      )}
    </Field>
  )
}
