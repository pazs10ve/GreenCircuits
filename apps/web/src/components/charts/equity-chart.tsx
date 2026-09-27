"use client"

import { useEffect, useRef } from "react"
import {
  AreaSeries,
  ColorType,
  LineSeries,
  LineStyle,
  createChart,
  createSeriesMarkers,
  type UTCTimestamp,
} from "lightweight-charts"
import type { Point } from "@greencircuits/market/lab"
import { cn } from "@/lib/utils"
import { useChartPalette } from "./theme"
import { istTickFormatter } from "./time"

/** Strategy vs benchmark equity, with the drawdown in a pane underneath. */
export function EquityChart({
  equity,
  benchmark,
  drawdown,
  splitTime,
  height = 380,
  className,
}: {
  equity: Point[]
  benchmark?: Point[]
  drawdown?: Point[]
  splitTime?: number
  height?: number
  className?: string
}) {
  const container = useRef<HTMLDivElement>(null)
  const palette = useChartPalette()

  useEffect(() => {
    if (!container.current || !palette) return
    // Rupee values in lakh or crore. Set per series: a chart-wide localization.priceFormatter
    // would override the drawdown pane's percent format.
    const rupees = {
      type: "custom" as const,
      minMove: 0.01,
      formatter: (v: number) => (Math.abs(v) >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : `₹${(v / 1e5).toFixed(1)} L`),
    }
    const chart = createChart(container.current, {
      autoSize: true,
      layout: {
        background: { type: ColorType.Solid, color: "transparent" },
        textColor: palette.muted,
        fontFamily: palette.font,
        fontSize: 11,
        attributionLogo: false,
        panes: { separatorColor: palette.border, enableResize: false },
      },
      grid: { vertLines: { color: palette.grid }, horzLines: { color: palette.grid } },
      rightPriceScale: { borderColor: palette.border },
      timeScale: { borderColor: palette.border, tickMarkFormatter: istTickFormatter },
      crosshair: {
        vertLine: { color: palette.muted, labelBackgroundColor: palette.primary, style: LineStyle.Dashed },
        horzLine: { color: palette.muted, labelBackgroundColor: palette.primary, style: LineStyle.Dashed },
      },
    })
    const toData = (pts: Point[]) => pts.map((p) => ({ time: p.time as UTCTimestamp, value: p.value }))

    if (benchmark) {
      const b = chart.addSeries(LineSeries, {
        color: palette.benchmark,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        priceLineVisible: false,
        lastValueVisible: false,
        title: "Benchmark",
        priceFormat: rupees,
      })
      b.setData(toData(benchmark))
    }
    const s = chart.addSeries(AreaSeries, {
      lineColor: palette.primary,
      topColor: palette.primaryFill,
      bottomColor: "rgba(0,0,0,0)",
      lineWidth: 2,
      priceLineVisible: false,
      title: "Strategy",
      priceFormat: rupees,
    })
    s.setData(toData(equity))

    if (drawdown) {
      const dd = chart.addSeries(
        AreaSeries,
        {
          lineColor: palette.down,
          topColor: "rgba(0,0,0,0)",
          bottomColor: palette.downFill,
          lineWidth: 1,
          priceLineVisible: false,
          lastValueVisible: false,
          invertFilledArea: true,
          priceFormat: { type: "custom", formatter: (v: number) => `${v.toFixed(1)}%` },
        },
        1,
      )
      dd.setData(toData(drawdown))
      const panes = chart.panes()
      panes[0]?.setHeight(Math.round(height * 0.72))
      panes[1]?.setHeight(Math.round(height * 0.28))
    }
    if (splitTime) {
      createSeriesMarkers(s, [
        { time: splitTime as UTCTimestamp, position: "aboveBar", shape: "arrowDown", color: palette.muted, text: "Out of sample" },
      ])
    }
    chart.timeScale().fitContent()
    return () => chart.remove()
  }, [equity, benchmark, drawdown, splitTime, palette, height])

  return <div ref={container} className={cn("w-full", className)} style={{ height }} />
}
