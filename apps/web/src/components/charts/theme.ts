"use client"

import { useTheme } from "next-themes"
import { useEffect, useState } from "react"

export interface ChartPalette {
  text: string
  muted: string
  grid: string
  border: string
  up: string
  down: string
  upFill: string
  downFill: string
  primary: string
  primaryFill: string
  benchmark: string
  background: string
  font: string
}

let probe: CanvasRenderingContext2D | null = null

/** Resolve a CSS colour (including oklch and var()) to rgba() by painting one pixel. */
function toRgba(cssColor: string, alpha = 1): string {
  if (typeof document === "undefined") return "rgba(0,0,0,1)"
  if (!probe) {
    const canvas = document.createElement("canvas")
    canvas.width = canvas.height = 1
    probe = canvas.getContext("2d", { willReadFrequently: true })
  }
  if (!probe) return cssColor
  probe.clearRect(0, 0, 1, 1)
  probe.fillStyle = "#000"
  probe.fillStyle = cssColor
  probe.fillRect(0, 0, 1, 1)
  const [r, g, b, a] = probe.getImageData(0, 0, 1, 1).data
  return `rgba(${r},${g},${b},${((a ?? 255) / 255) * alpha})`
}

function readVar(name: string): string {
  return getComputedStyle(document.documentElement).getPropertyValue(name).trim()
}

function palette(): ChartPalette {
  return {
    text: toRgba(readVar("--foreground"), 0.85),
    muted: toRgba(readVar("--muted-foreground")),
    grid: toRgba(readVar("--foreground"), 0.06),
    border: toRgba(readVar("--foreground"), 0.12),
    up: toRgba(readVar("--up")),
    down: toRgba(readVar("--down")),
    upFill: toRgba(readVar("--up"), 0.35),
    downFill: toRgba(readVar("--down"), 0.35),
    primary: toRgba(readVar("--primary")),
    primaryFill: toRgba(readVar("--primary"), 0.18),
    benchmark: toRgba(readVar("--muted-foreground"), 0.9),
    background: toRgba(readVar("--card")),
    font: getComputedStyle(document.body).fontFamily,
  }
}

/** Chart colours for the current theme; recomputed when the theme changes. */
export function useChartPalette(): ChartPalette | null {
  const { resolvedTheme } = useTheme()
  const [p, setP] = useState<ChartPalette | null>(null)
  useEffect(() => {
    // After this render, so the theme class has been applied to <html>. A timer rather than an animation
    // frame: frames don't run in a background tab, and a chart opened in one should be ready when it's shown.
    const id = setTimeout(() => setP(palette()), 0)
    return () => clearTimeout(id)
  }, [resolvedTheme])
  return p
}
