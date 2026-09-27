"use client"

import { useRouter } from "next/navigation"
import { useEffect, useRef } from "react"
import { toast } from "sonner"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatPct, formatPrice } from "@greencircuits/market/format"
import { useMarketTick } from "@/lib/stream/hooks"
import { quoteStore } from "@/lib/stream/store"
import { CONDITION_LABEL, isPercent, useAlerts, type Alert } from "@/lib/stores/alerts"
import { usePreferences } from "@/lib/stores/preferences"
import { refreshAlerts, sessionReady } from "@/lib/stores/remote"
import { useMarket } from "@/lib/stream/market-context"

function istDay(d: Date): string {
  return new Date(d.getTime() + 5.5 * 3600 * 1000).toISOString().slice(0, 10)
}

function met(a: Alert, ltp: number, changePct: number): boolean {
  switch (a.condition) {
    case "PRICE_ABOVE":
      return ltp >= a.value
    case "PRICE_BELOW":
      return ltp <= a.value
    case "CHANGE_ABOVE":
      return changePct >= a.value
    case "CHANGE_BELOW":
      return changePct <= a.value
  }
}

function beep() {
  try {
    const ctx = new AudioContext()
    const osc = ctx.createOscillator()
    const gain = ctx.createGain()
    osc.frequency.value = 880
    gain.gain.setValueAtTime(0.08, ctx.currentTime)
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.25)
    osc.connect(gain).connect(ctx.destination)
    osc.start()
    osc.stop(ctx.currentTime + 0.25)
    osc.onended = () => void ctx.close()
  } catch {
    // Audio blocked until the user interacts with the page; the toast still shows.
  }
}

/**
 * Evaluates active alerts against the stream once a second, the way the alert
 * engine does server-side. Repeating alerts fire at most once per IST day.
 */
export function AlertWatcher() {
  const { mode } = useMarket()
  return mode === "live" ? <ServerAlerts /> : <BrowserAlerts />
}

interface ServerNotification {
  id: string
  kind: string
  title: string
  body: string
  deeplink: string | null
  created_at: string
}

/** Live mode: the alert engine evaluates alerts on the server; show its notifications as they arrive. */
function ServerAlerts() {
  const router = useRouter()
  useEffect(() => {
    let newest: string | null = null
    let stopped = false
    const poll = async () => {
      try {
        const query = newest ? `?after=${encodeURIComponent(newest)}` : ""
        const res = await fetch(`/api/v1/me/notifications${query}`, { credentials: "same-origin" })
        if (!res.ok) return
        const { notifications } = (await res.json()) as { notifications: ServerNotification[] }
        // The first poll only sets the baseline; older notifications aren't news.
        if (newest) {
          for (const n of [...notifications].reverse()) {
            toast(n.title, {
              description: n.body,
              action: n.deeplink ? { label: "View", onClick: () => router.push(n.deeplink!) } : undefined,
              duration: 8000,
            })
            if (usePreferences.getState().alertSound) beep()
          }
          if (notifications.some((n) => n.kind === "ALERT")) await refreshAlerts().catch(() => {})
        }
        newest = notifications[0]?.created_at ?? newest ?? new Date().toISOString()
      } catch {
        // Offline for a moment; the next poll catches up.
      }
    }
    void sessionReady().then(poll)
    const timer = setInterval(() => {
      if (!stopped && !document.hidden) void poll()
    }, 10_000)
    return () => {
      stopped = true
      clearInterval(timer)
    }
  }, [router])
  return null
}

/** Demo mode: no backend, so this browser checks its own alerts against the simulated feed. */
function BrowserAlerts() {
  const tick = useMarketTick(1000)
  const router = useRouter()
  const fired = useRef(new Set<string>())

  useEffect(() => {
    if (!useAlerts.persist.hasHydrated()) return
    const { alerts, trigger } = useAlerts.getState()
    const now = new Date()
    for (const a of alerts) {
      if (a.status !== "ACTIVE") continue
      if (a.repeat && a.triggeredAt && istDay(a.triggeredAt) === istDay(now)) continue
      const q = quoteStore.get(a.instrumentId)
      if (!q || !met(a, q.ltp, q.changePct)) continue
      const key = `${a.id}:${istDay(now)}`
      if (fired.current.has(key)) continue
      fired.current.add(key)
      trigger(a.id, q.ltp)

      const inst = getInstrument(a.instrumentId)
      if (!inst) continue
      const level = isPercent(a.condition) ? formatPct(a.value) : `₹${formatPrice(a.value, inst.tick)}`
      toast(`${inst.symbol}: ${CONDITION_LABEL[a.condition].toLowerCase()} ${level}`, {
        description: `Now ₹${formatPrice(q.ltp, inst.tick)} (${formatPct(q.changePct)})${a.note ? ` · ${a.note}` : ""}`,
        action: { label: "View", onClick: () => router.push(`/stocks/${inst.slug}`) },
        duration: 8000,
      })
      if (usePreferences.getState().alertSound) beep()
    }
  }, [tick, router])

  return null
}
