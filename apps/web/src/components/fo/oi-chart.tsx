"use client"

import { useState } from "react"
import { formatNumber } from "@greencircuits/market/format"
import { Section } from "@/components/editorial/section"
import { Segmented } from "@/components/market/segmented"
import { SERIES } from "@/components/parts/series"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatOi, type LiveChain, type OiUnit } from "./chain-model"

/** Calls and puts, drawn the same wherever they appear: two series, neither read as a rise or a fall. */
export const CALL = SERIES[1]!
export const PUT = SERIES[2]!

/** Strikes each side of the money the chart shows. */
const REACH = 10
/** The widest bar, as a share of its half: room is left for its number. */
const WIDEST = 72

type Show = "oi" | "change"

function Swatch({ color, children }: { color: string; children: React.ReactNode }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-xs text-ink-2">
      <span className="size-2 rounded-[2px]" style={{ background: color }} aria-hidden="true" />
      {children}
    </span>
  )
}

/**
 * Open interest at each strike near the money, calls to the left and puts to
 * the right: where the most positions sit reads at a glance. Or the day's
 * change in it, with falls drawn faint.
 */
export function OiChart({ chain, unit, className }: { chain: LiveChain | null; unit: OiUnit; className?: string }) {
  const [show, setShow] = useState<Show>("oi")
  const rows = chain ? chain.rows.filter((r) => Math.abs(r.strike - chain.atm) <= REACH * chain.step).sort((a, b) => b.strike - a.strike) : []
  const val = (s: { oi: number; oiChange: number }) => (show === "oi" ? s.oi : s.oiChange)
  const max = Math.max(1, ...rows.flatMap((r) => [Math.abs(val(r.ce)), Math.abs(val(r.pe))]))
  const most = (side: "ce" | "pe") => rows.reduce<(typeof rows)[number] | null>((a, b) => (!a || b[side].oi > a[side].oi ? b : a), null)?.strike
  const [topCall, topPut] = [most("ce"), most("pe")]
  const near = chain && rows.length ? rows.reduce((a, b) => (Math.abs(b.strike - chain.spot) < Math.abs(a.strike - chain.spot) ? b : a)).strike : null
  const fmt = (v: number) => (chain ? formatOi(v, unit, chain.lot, show === "change") : "")

  return (
    <Section
      className={className}
      title={show === "oi" ? "Open interest by strike" : "Change in open interest today"}
      description="Contracts still open at each strike near the money: calls to the left, puts to the right. The most calls often mark where sellers think the price will stop rising, the most puts where it will stop falling. Sample data."
      action={
        <Segmented
          value={show}
          onChange={setShow}
          options={[
            { value: "oi", label: "Open" },
            { value: "change", label: "Change today" },
          ]}
          aria-label="Show"
        />
      }
    >
      <div className="mb-2.5 grid grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center">
        <span className="justify-self-end">
          <Swatch color={CALL}>Calls</Swatch>
        </span>
        <span className="text-center text-xs text-ink-3">Strike</span>
        <Swatch color={PUT}>Puts</Swatch>
      </div>
      {!chain ? (
        <div className="grid gap-[3px]">
          {Array.from({ length: 2 * REACH + 1 }, (_, i) => (
            <Skeleton key={i} className="h-6" />
          ))}
        </div>
      ) : (
        <div className="grid gap-[3px]" role="img" aria-label={`Most call open interest at ${formatNumber(topCall ?? 0, 0)}, most put open interest at ${formatNumber(topPut ?? 0, 0)}`}>
          {rows.map((r) => {
            const [c, p] = [val(r.ce), val(r.pe)]
            const strong = r.strike === topCall || r.strike === topPut || r.strike === near
            return (
              <div key={r.strike} className={cn("grid h-6 grid-cols-[minmax(0,1fr)_5.5rem_minmax(0,1fr)] items-center rounded-md", r.strike === near && "bg-panel")}>
                <div className="flex min-w-0 items-center justify-end gap-2 pr-1">
                  <span className="num shrink-0 text-[11px] text-ink-3">{fmt(c)}</span>
                  <span className="h-2.5 shrink-0 rounded-[3px]" style={{ width: `${(Math.abs(c) / max) * WIDEST}%`, background: CALL, opacity: c < 0 ? 0.35 : 1 }} />
                </div>
                <span className={cn("num text-center text-[13px]", strong ? "font-bold text-ink" : "font-medium text-ink-2")}>{formatNumber(r.strike, 0)}</span>
                <div className="flex min-w-0 items-center gap-2 pl-1">
                  <span className="h-2.5 shrink-0 rounded-[3px]" style={{ width: `${(Math.abs(p) / max) * WIDEST}%`, background: PUT, opacity: p < 0 ? 0.35 : 1 }} />
                  <span className="num shrink-0 text-[11px] text-ink-3">{fmt(p)}</span>
                </div>
              </div>
            )
          })}
        </div>
      )}
      <div className="mt-3 flex flex-wrap justify-between gap-2 text-xs text-ink-3">
        <span>Shaded: the strike nearest the price{chain ? `, ${formatNumber(chain.spot, 0)}` : ""}</span>
        <span>{unit === "lakh" ? "Lakh units" : "Contracts"}</span>
      </div>
    </Section>
  )
}
