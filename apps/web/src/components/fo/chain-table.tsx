"use client"

import { Fragment, useCallback, useEffect } from "react"
import { Crosshair } from "lucide-react"
import type { OptionType } from "@greencircuits/market/black76"
import { formatNumber, formatPct, formatPrice } from "@greencircuits/market/format"
import { useElementSize } from "@/hooks/use-element-size"
import { Button } from "@/components/ui/button"
import { Kbd } from "@/components/ui/kbd"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatOi, type ChainQuote, type LiveRow, type OiUnit } from "./chain-model"
import type { Side } from "./legs"
import { CALL, PUT } from "./oi-chart"

type Col = "ltp" | "iv" | "oi" | "oiChg" | "vol" | "bid" | "ask" | "delta" | "gamma" | "theta" | "vega"

const WIDTH: Record<Col, number> = {
  ltp: 88, iv: 48, oi: 92, oiChg: 76, vol: 80, bid: 64, ask: 64, delta: 56, gamma: 62, theta: 60, vega: 56,
}
const LABEL: Record<Col, string> = {
  ltp: "LTP", iv: "IV", oi: "OI", oiChg: "OI chg", vol: "Volume", bid: "Bid", ask: "Ask",
  delta: "Delta", gamma: "Gamma", theta: "Theta", vega: "Vega",
}
const STRIKE_WIDTH = 88
/** Container width from which bid and ask columns fit without sideways scrolling. */
const BID_ASK_FROM = 1120
const SKELETON_ROWS = 21

/** Columns from the strike outwards; puts read left to right in this order, calls mirrored. */
function columns(greeks: boolean, bidAsk: boolean): { calls: Col[]; puts: Col[] } {
  const inner: Col[] = ["ltp", "iv", "oi", "oiChg"]
  const outer: Col[] = greeks ? ["delta", "gamma", "theta", "vega"] : ["vol"]
  const puts = [...inner, ...outer, ...(bidAsk && !greeks ? (["bid", "ask"] as Col[]) : [])]
  const calls = [...(bidAsk && !greeks ? (["bid", "ask"] as Col[]) : []), ...[...inner, ...outer].reverse()]
  return { calls, puts }
}

export interface Held {
  side: Side
  lots: number
}

export function ChainTable({
  rows,
  spot,
  lot,
  unit,
  greeks,
  atm,
  maxPain,
  held,
  onTrade,
  scrollKey,
  symbol,
}: {
  rows: LiveRow[]
  spot: number | undefined
  lot: number
  unit: OiUnit
  greeks: boolean
  atm: number | undefined
  maxPain: number | undefined
  /** Strategy legs on this expiry, keyed `${strike}:${type}`. */
  held: Map<string, Held>
  onTrade: (row: LiveRow, type: OptionType, side: Side) => void
  /** Scrolls the spot row into the middle whenever this changes. */
  scrollKey: string
  symbol: string
}) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const ready = rows.length > 0 && spot != null
  const { calls, puts } = columns(greeks, size.width >= BID_ASK_FROM)
  const minWidth = [...calls, ...puts].reduce((s, c) => s + WIDTH[c], STRIKE_WIDTH)
  const maxOi = Math.max(1, ...rows.flatMap((r) => [r.ce.oi, r.pe.oi]))
  const markerAt = spot == null ? -1 : rows.filter((r) => r.strike <= spot).length

  const scrollToSpot = useCallback(() => {
    const el = ref.current
    if (!el) return
    const head = el.querySelector("thead")?.offsetHeight ?? 0
    const marker = el.querySelector<HTMLElement>("[data-spot-marker]")
    const strike = el.querySelector<HTMLElement>("[data-strike-head]")
    if (marker) el.scrollTop = marker.offsetTop - head - (el.clientHeight - head - marker.offsetHeight) / 2
    if (strike) el.scrollLeft = strike.offsetLeft - (el.clientWidth - strike.offsetWidth) / 2
  }, [ref])

  useEffect(() => {
    if (ready) scrollToSpot()
  }, [ready, scrollKey, scrollToSpot])

  const cellBase = "h-10 border-b border-rule px-2 text-right whitespace-nowrap"
  const headBase = "sticky top-7 z-20 h-8 border-b border-rule-strong bg-paper px-2 text-right text-xs font-medium text-ink-3"

  const renderCell = (col: Col, row: LiveRow, type: OptionType) => {
    const q = type === "CE" ? row.ce : row.pe
    const itm = spot != null && (type === "CE" ? row.strike < spot : row.strike > spot)
    const shade = itm ? "bg-panel" : "group-hover/row:bg-panel/70"
    if (col === "ltp") {
      return (
        <LtpCell key={col} q={q} row={row} type={type} held={held.get(`${row.strike}:${type}`)} onTrade={onTrade} symbol={symbol} className={shade} />
      )
    }
    if (col === "oi") {
      return (
        <td key={col} className={cn(cellBase, "relative", shade)}>
          <span
            aria-hidden="true"
            className={cn("absolute inset-y-2 rounded-[2px] opacity-25 transition-[width] duration-500", type === "CE" ? "right-1" : "left-1")}
            style={{ width: `calc(${(q.oi / maxOi) * 100}% - 8px)`, background: type === "CE" ? CALL : PUT }}
          />
          <span className="num relative">{formatOi(q.oi, unit, lot)}</span>
        </td>
      )
    }
    return (
      <td key={col} className={cn(cellBase, "num", shade, col === "iv" || col === "oiChg" || col === "vol" ? "" : "text-ink-3")}>
        {cellText(col, q, unit, lot)}
      </td>
    )
  }

  return (
    <div>
      <div ref={ref} className="scrollbar-thin h-[min(680px,70svh)] overflow-auto overscroll-x-contain">
        <table className="w-full table-fixed border-separate border-spacing-0 text-[13px]" style={{ minWidth }}>
          <colgroup>
            {calls.map((c) => <col key={`c-${c}`} style={{ width: WIDTH[c] }} />)}
            <col style={{ width: STRIKE_WIDTH }} />
            {puts.map((c) => <col key={`p-${c}`} style={{ width: WIDTH[c] }} />)}
          </colgroup>
          <caption className="sr-only">
            {symbol} option chain: calls on the left, puts on the right of each strike.
          </caption>
          <thead>
            <tr>
              <th scope="colgroup" colSpan={calls.length} className="sticky top-0 z-20 h-7 border-b border-rule bg-paper px-3 text-right text-sm font-semibold">
                Calls
              </th>
              <th
                scope="col"
                rowSpan={2}
                data-strike-head
                className="sticky top-0 right-0 left-0 z-30 border-x border-b border-rule bg-paper px-2 text-center text-xs font-normal text-ink-3"
              >
                Strike
              </th>
              <th scope="colgroup" colSpan={puts.length} className="sticky top-0 z-20 h-7 border-b border-rule bg-paper px-3 text-left text-sm font-semibold">
                Puts
              </th>
            </tr>
            <tr>
              {calls.map((c) => <th key={`c-${c}`} scope="col" className={headBase}>{LABEL[c]}</th>)}
              {puts.map((c) => <th key={`p-${c}`} scope="col" className={headBase}>{LABEL[c]}</th>)}
            </tr>
          </thead>
          <tbody>
            {!ready &&
              Array.from({ length: SKELETON_ROWS }, (_, i) => (
                <tr key={i}>
                  {[...calls, "strike", ...puts].map((c, j) => (
                    <td key={j} className={cn(cellBase, c === "strike" && "sticky right-0 left-0 z-10 border-x border-rule bg-paper")}>
                      <Skeleton className="ml-auto h-3 w-3/4" />
                    </td>
                  ))}
                </tr>
              ))}
            {ready &&
              rows.map((row, i) => (
                <Fragment key={row.strike}>
                  {i === markerAt && <SpotRow spot={spot} calls={calls.length} puts={puts.length} />}
                  <tr className="group/row">
                    {calls.map((c) => renderCell(c, row, "CE"))}
                    <th
                      scope="row"
                      className={cn(
                        "sticky right-0 left-0 z-10 h-10 border-x border-b border-rule bg-paper px-2 text-center font-semibold group-hover/row:bg-surface",
                        row.strike === atm && "text-accent-ink",
                      )}
                    >
                      <span className="num">{formatNumber(row.strike, 0)}</span>
                      {row.strike === maxPain && (
                        <abbr title="Max pain: where option buyers as a whole would lose most at expiry" className="ml-1 align-top text-[10px] font-normal text-ink-3 no-underline">
                          max pain
                        </abbr>
                      )}
                    </th>
                    {puts.map((c) => renderCell(c, row, "PE"))}
                  </tr>
                </Fragment>
              ))}
            {ready && markerAt === rows.length && <SpotRow spot={spot} calls={calls.length} puts={puts.length} />}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-sm text-ink-3">
        <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
          <span className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-[2px] bg-surface-2" aria-hidden="true" /> In the money
          </span>
          <span>
            Click an LTP to buy, <Kbd>Shift</Kbd>-click or press <Kbd>S</Kbd> to sell
          </span>
        </span>
        <Button variant="ghost" size="sm" onClick={scrollToSpot} disabled={!ready}>
          <Crosshair /> Scroll to spot
        </Button>
      </div>
    </div>
  )
}

function cellText(col: Col, q: ChainQuote, unit: OiUnit, lot: number): string {
  switch (col) {
    case "iv":
      return formatNumber(q.iv, 1)
    case "oiChg":
      return formatOi(q.oiChange, unit, lot, true)
    case "vol":
      return formatOi(q.volume, unit, lot)
    case "bid":
      return formatPrice(q.bid)
    case "ask":
      return formatPrice(q.ask)
    case "delta":
      return formatNumber(q.delta, 2)
    case "gamma":
      return formatNumber(q.gamma, 4)
    case "theta":
      return formatNumber(q.theta, 2)
    case "vega":
      return formatNumber(q.vega, 2)
    default:
      return ""
  }
}

function SpotRow({ spot, calls, puts }: { spot: number | undefined; calls: number; puts: number }) {
  const line = <span className="absolute inset-x-0 top-1/2 h-px bg-accent-ink/70" />
  return (
    <tr aria-hidden="true" data-spot-marker>
      <td colSpan={calls} className="relative h-6 p-0">{line}</td>
      <td className="sticky right-0 left-0 z-10 h-6 border-x border-rule bg-paper p-0 text-center">
        {line}
        <span className="num relative inline-flex h-5 items-center rounded-sm bg-accent-ink px-1.5 text-[11px] font-semibold text-paper">
          {formatPrice(spot)}
        </span>
      </td>
      <td colSpan={puts} className="relative h-6 p-0">{line}</td>
    </tr>
  )
}

function LtpCell({
  q,
  row,
  type,
  held,
  onTrade,
  symbol,
  className,
}: {
  q: ChainQuote
  row: LiveRow
  type: OptionType
  held: Held | undefined
  onTrade: (row: LiveRow, type: OptionType, side: Side) => void
  symbol: string
  className?: string
}) {
  const change = q.prevLtp ? ((q.ltp - q.prevLtp) / q.prevLtp) * 100 : undefined
  const name = `${symbol} ${formatNumber(row.strike, 0)} ${type}`
  return (
    <td className={cn("group/cell relative h-10 border-b border-rule p-0", className)}>
      <button
        type="button"
        onClick={(e) => onTrade(row, type, e.shiftKey ? "SELL" : "BUY")}
        onKeyDown={(e) => {
          if (e.key === "s" || e.key === "S") {
            e.preventDefault()
            onTrade(row, type, "SELL")
          }
        }}
        aria-label={`${name}, last ${formatPrice(q.ltp)}. Enter to buy, S to sell.`}
        className="flex size-full cursor-pointer flex-col items-end justify-center px-2 leading-tight outline-none hover:bg-surface-2 focus-visible:bg-surface-2 focus-visible:ring-2 focus-visible:ring-ring/50 focus-visible:ring-inset"
      >
        <span className="num font-medium">{formatPrice(q.ltp)}</span>
        <span
          className={cn(
            "num text-[11px]",
            change == null || Math.abs(change) < 0.005 ? "text-ink-3" : change > 0 ? "text-up" : "text-down",
          )}
        >
          {change == null ? "–" : formatPct(change, 1)}
        </span>
      </button>
      {held && (
        <span
          className={cn(
            "pointer-events-none absolute top-1/2 left-1 -translate-y-1/2 rounded-sm px-1 text-[9px] leading-4 font-semibold transition-opacity group-hover/cell:opacity-0",
            held.side === "BUY" ? "bg-primary text-primary-foreground" : "bg-foreground text-background",
          )}
        >
          {held.side === "BUY" ? "B" : "S"}
          {held.lots}
        </span>
      )}
      <span className="pointer-events-none absolute top-1/2 left-1 flex -translate-y-1/2 gap-0.5 opacity-0 transition-opacity group-focus-within/cell:opacity-100 group-hover/cell:pointer-events-auto group-hover/cell:opacity-100">
        {(["BUY", "SELL"] as const).map((side) => (
          <button
            key={side}
            type="button"
            tabIndex={-1}
            onClick={() => onTrade(row, type, side)}
            aria-label={`${side === "BUY" ? "Buy" : "Sell"} ${name}`}
            className={cn(
              "flex size-5 cursor-pointer items-center justify-center rounded-sm text-[10px] font-semibold",
              side === "BUY"
                ? "bg-primary text-primary-foreground hover:bg-primary/85"
                : "border bg-background text-foreground hover:bg-muted",
            )}
          >
            {side === "BUY" ? "B" : "S"}
          </button>
        ))}
      </span>
    </td>
  )
}

