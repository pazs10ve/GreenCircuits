"use client"

import Link from "next/link"
import { useMemo } from "react"
import { EQUITIES, SECTORS, marketCapCr } from "@greencircuits/market/catalog"
import type { Instrument, Sector } from "@greencircuits/market/types"
import { squarify } from "@/lib/treemap"
import { formatPct } from "@greencircuits/market/format"
import { useQuoteReader } from "@/lib/stream/hooks"
import { useElementSize } from "@/hooks/use-element-size"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"

/** Background for a % change: deeper colour for bigger moves, saturating at ±3%. */
export function heatColor(pct: number | undefined): string {
  if (pct == null) return "var(--muted)"
  const x = Math.max(-1, Math.min(1, pct / 3))
  const strength = Math.round(12 + Math.abs(x) * 50)
  return `color-mix(in oklch, ${x >= 0 ? "var(--up)" : "var(--down)"} ${strength}%, var(--card))`
}

const HEADER = 18
const GAP = 2

/**
 * Nifty 50 treemap: sectors sized by market cap at yesterday's close (so the
 * layout holds still), each stock coloured by today's live change.
 */
export function SectorHeatmap({ className }: { className?: string }) {
  const [ref, size] = useElementSize<HTMLDivElement>()
  const read = useQuoteReader(1500)

  const bySector = useMemo(() => {
    const m = new Map<Sector, Instrument[]>()
    for (const e of EQUITIES) {
      const list = m.get(e.sector!) ?? []
      list.push(e)
      m.set(e.sector!, list)
    }
    return m
  }, [])

  const layout = useMemo(() => {
    if (!size.width || !size.height) return []
    const sectors = squarify(
      SECTORS.map((s) => ({
        value: (bySector.get(s) ?? []).reduce((sum, e) => sum + marketCapCr(e, e.prevClose), 0),
        data: s,
      })),
      { x: 0, y: 0, w: size.width, h: size.height },
    )
    return sectors.map((cell) => {
      const labelled = cell.h > 48 && cell.w > 70
      const inner = {
        x: cell.x + GAP,
        y: cell.y + (labelled ? HEADER : GAP),
        w: Math.max(0, cell.w - GAP * 2),
        h: Math.max(0, cell.h - (labelled ? HEADER : GAP) - GAP),
      }
      const stocks = squarify(
        (bySector.get(cell.data) ?? []).map((e) => ({ value: marketCapCr(e, e.prevClose), data: e })),
        inner,
      )
      return { ...cell, labelled, stocks }
    })
  }, [bySector, size.width, size.height])

  return (
    <div ref={ref} className={cn("relative h-[360px] w-full overflow-hidden rounded-md", className)}>
      {layout.map((sector) => {
        const members = bySector.get(sector.data) ?? []
        const avg =
          members.reduce((s, e) => s + (read(e.id)?.changePct ?? 0) * marketCapCr(e, e.prevClose), 0) /
          Math.max(1, members.reduce((s, e) => s + marketCapCr(e, e.prevClose), 0))
        return (
          <div key={sector.data}>
            <div
              className="absolute border border-background bg-muted/40"
              style={{ left: sector.x, top: sector.y, width: sector.w, height: sector.h }}
            />
            {sector.labelled && (
              <div
                className="absolute flex items-center justify-between gap-1 overflow-hidden px-1.5 text-[10px] font-semibold tracking-wide text-muted-foreground uppercase"
                style={{ left: sector.x, top: sector.y + 1, width: sector.w, height: HEADER }}
              >
                <span className="truncate">{sector.data}</span>
                <span className={cn("num shrink-0", avg > 0 ? "text-up" : avg < 0 ? "text-down" : "")}>{formatPct(avg)}</span>
              </div>
            )}
            {sector.stocks.map((cell) => {
              const q = read(cell.data.id)
              const showSymbol = cell.w > 42 && cell.h > 22
              const showPct = cell.w > 42 && cell.h > 38
              return (
                <Tooltip key={cell.data.id}>
                  <TooltipTrigger asChild>
                    <Link
                      href={`/stocks/${cell.data.slug}`}
                      className="absolute flex flex-col items-center justify-center overflow-hidden rounded-[3px] text-center transition-[background-color] duration-700 outline-none hover:ring-1 hover:ring-foreground/60 focus-visible:ring-2 focus-visible:ring-ring"
                      style={{
                        left: cell.x + 1,
                        top: cell.y + 1,
                        width: Math.max(0, cell.w - 2),
                        height: Math.max(0, cell.h - 2),
                        backgroundColor: heatColor(q?.changePct),
                      }}
                    >
                      {showSymbol && (
                        <span className="max-w-full truncate px-1 text-[11px] leading-tight font-semibold">{cell.data.symbol}</span>
                      )}
                      {showPct && <span className="num text-[10px] leading-tight opacity-80">{formatPct(q?.changePct)}</span>}
                    </Link>
                  </TooltipTrigger>
                  <TooltipContent side="top" className="text-xs">
                    <span className="font-medium">{cell.data.name}</span>
                    <span className="num ml-2">{formatPct(q?.changePct)}</span>
                  </TooltipContent>
                </Tooltip>
              )
            })}
          </div>
        )
      })}
    </div>
  )
}

/** Legend strip for the heatmap colour scale. */
export function HeatLegend() {
  const steps = [-3, -2, -1, 0, 1, 2, 3]
  return (
    <div className="flex items-center gap-0.5" aria-hidden="true">
      {steps.map((s) => (
        <span key={s} className="num flex h-4 w-8 items-center justify-center rounded-[2px] text-[9px]" style={{ backgroundColor: heatColor(s) }}>
          {s > 0 ? "+" : s < 0 ? "−" : ""}
          {Math.abs(s)}%
        </span>
      ))}
    </div>
  )
}
