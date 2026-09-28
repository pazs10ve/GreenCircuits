"use client"

import Link from "next/link"
import { useMemo, useState } from "react"
import { getInstrument, hrefOf, marketCapCr } from "@greencircuits/market/catalog"
import { formatCrore, formatPct, formatPrice } from "@greencircuits/market/format"
import type { Instrument } from "@greencircuits/market/types"
import { useElementSize } from "@/hooks/use-element-size"
import { useQuoteReader } from "@/lib/stream/hooks"
import { Segmented } from "@/components/market/segmented"
import { heat } from "@/components/parts/heat"
import { HeatScale } from "@/components/parts/heat-scale"
import { Move } from "@/components/parts/move"
import { cn } from "@/lib/utils"
import { squarify, type Rect, type Tile } from "./treemap"

/** A move this big or bigger gets the full colour. */
const FULL = 3

interface Block {
  sector: string
  rect: Rect
  /** Height of the sector's name strip; none when the block is too small to label. */
  head: number
  tiles: Tile<Instrument>[]
}

export type HeatmapUniverse = "nifty50" | "nifty500"

/**
 * The market as a map: every company a tile sized by its market value,
 * grouped into its sector, and coloured by today's move. The layout follows
 * size at the last close and holds still; only the colours follow the prices.
 */
export function Heatmap({ members }: { members: Record<HeatmapUniverse, number[]> }) {
  // Until the reader picks, a phone gets the Nifty 50: five hundred tiles on a narrow screen are too small to read.
  const [chosen, setUniverse] = useState<HeatmapUniverse | null>(null)
  const [ref, { width }] = useElementSize<HTMLDivElement>()
  const universe = chosen ?? (width > 0 && width < 640 ? "nifty50" : "nifty500")
  const read = useQuoteReader(3000)
  const [hover, setHover] = useState<{ inst: Instrument; x: number; y: number } | null>(null)
  const height = width < 640 ? 440 : Math.round(Math.min(640, Math.max(460, width * 0.4)))

  const blocks = useMemo<Block[]>(() => {
    if (width <= 0) return []
    const stocks = members[universe].flatMap((id) => getInstrument(id) ?? []).filter((i) => i.sector)
    const bySector = new Map<string, Instrument[]>()
    for (const s of stocks) bySector.set(s.sector!, [...(bySector.get(s.sector!) ?? []), s])
    const groups = [...bySector].map(([sector, list]) => ({ sector, list, value: list.reduce((sum, i) => sum + marketCapCr(i, i.prevClose), 0) }))
    return squarify(groups, (g) => g.value, { x: 0, y: 0, w: width, h: height }).map(({ item, ...rect }) => {
      const head = rect.w > 64 && rect.h > 44 ? 17 : 0
      const inner = { x: rect.x + 1, y: rect.y + head + 1, w: rect.w - 2, h: rect.h - head - 2 }
      return { sector: item.sector, rect, head, tiles: squarify(item.list, (i) => marketCapCr(i, i.prevClose), inner) }
    })
  }, [members, universe, width, height])

  const q = hover ? read(hover.inst.id) : undefined

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <Segmented
          aria-label="Companies on the map"
          value={universe}
          onChange={setUniverse}
          options={[
            { value: "nifty50", label: "Nifty 50" },
            { value: "nifty500", label: "Nifty 500" },
          ]}
        />
        <HeatScale cap={FULL} />
      </div>
      <div
        ref={ref}
        role="group"
        aria-label={`${universe === "nifty50" ? "Nifty 50" : "Nifty 500"} companies by market value and today's move`}
        className="relative w-full overflow-hidden rounded-panel"
        style={{ height }}
        onPointerLeave={() => setHover(null)}
      >
        {blocks.map((b) => (
          <div key={b.sector}>
            {b.head > 0 && (
              <p
                className="absolute truncate px-1 text-[11px] leading-[17px] font-semibold text-ink-3"
                style={{ left: b.rect.x, top: b.rect.y, width: b.rect.w, height: b.head }}
              >
                {b.sector}
              </p>
            )}
            {b.tiles.map((t) => {
              const pct = read(t.item.id)?.changePct
              const { bg, fg } = heat(pct, FULL)
              const big = t.w > 110 && t.h > 64
              return (
                <Link
                  key={t.item.id}
                  href={hrefOf(t.item)}
                  aria-label={`${t.item.name}, ${pct == null ? "no price yet" : formatPct(pct)}`}
                  onPointerMove={(e) => {
                    const box = ref.current?.getBoundingClientRect()
                    if (box) setHover({ inst: t.item, x: e.clientX - box.left, y: e.clientY - box.top })
                  }}
                  className="absolute flex flex-col items-center justify-center overflow-hidden rounded-[4px] border border-paper text-center transition-[filter] hover:brightness-105 focus-visible:z-10 focus-visible:outline-2 focus-visible:outline-ink"
                  style={{ left: t.x, top: t.y, width: t.w, height: t.h, background: bg, color: fg }}
                >
                  {t.w > 40 && t.h > 20 && <span className={cn("max-w-full truncate px-0.5 leading-tight font-semibold", big ? "text-[15px]" : "text-[11px]")}>{t.item.symbol}</span>}
                  {t.w > 50 && t.h > 34 && pct != null && <span className={cn("num leading-tight opacity-90", big ? "text-sm" : "text-[10px]")}>{formatPct(pct, 1)}</span>}
                </Link>
              )
            })}
          </div>
        ))}
        {hover && (
          <div
            className="pointer-events-none absolute z-20 w-56 rounded-panel border border-rule bg-popover p-3 text-sm shadow-lg"
            style={{ left: Math.min(hover.x + 14, Math.max(0, width - 232)), top: hover.y + 16 > height - 110 ? hover.y - 110 : hover.y + 16 }}
          >
            <p className="truncate font-medium">{hover.inst.name}</p>
            <p className="text-xs text-ink-3">
              {hover.inst.symbol} · {hover.inst.sector}
            </p>
            <p className="mt-2 flex items-baseline justify-between gap-3">
              <span className="num">₹{formatPrice(q?.ltp ?? hover.inst.prevClose, hover.inst.tick)}</span>
              <Move value={q?.changePct ?? 0} />
            </p>
            <p className="num mt-0.5 text-xs text-ink-3">Market value {formatCrore(marketCapCr(hover.inst, q?.ltp ?? hover.inst.prevClose))}</p>
          </div>
        )}
      </div>
    </div>
  )
}
