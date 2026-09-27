"use client"

import { useMemo, useState } from "react"
import { toast } from "sonner"
import type { OptionType } from "@greencircuits/market/black76"
import { formatNumber, formatPrice } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"
import { foUnderlying, formatExpiry, type LiveRow, type OiUnit } from "./chain-model"
import { ChainControls, type StrikeWindow } from "./chain-controls"
import { ChainStats } from "./chain-stats"
import { ChainTable, type Held } from "./chain-table"
import { addLeg, quoteOf, type Side, type StrategyLeg } from "./legs"
import { StrategyBuilder } from "./strategy-builder"
import { useOptionChain } from "./use-option-chain"

/**
 * The option chain page body: controls, headline stats, the chain and the
 * strategy builder. Everything time-dependent renders after hydration.
 */
export function OptionChainView({ id, initialExpiry }: { id: number; initialExpiry?: string }) {
  const inst = foUnderlying(id)!
  const [expiryKey, setExpiryKey] = useState<string | null>(initialExpiry ?? null)
  const [strikes, setStrikes] = useState<StrikeWindow>("10")
  const [unit, setUnit] = useState<OiUnit>("lakh")
  const [greeks, setGreeks] = useState(false)
  const [legs, setLegs] = useState<StrategyLeg[]>([])
  const { nowMs, expiries, expiry, chain, quote, vix } = useOptionChain(inst, expiryKey)

  // The visible strikes centre on the ATM strike, but only move once the spot
  // has drifted a few strikes away, so rows do not shift under the pointer.
  const [view, setView] = useState<{ key: string; centre: number } | null>(null)
  const viewKey = `${expiry?.key}:${strikes}`
  let centre = view?.centre ?? null
  if (chain) {
    const limit = strikes === "all" ? Infinity : Math.max(2, Math.floor(Number(strikes) * 0.4)) * chain.step
    if (!view || view.key !== viewKey || Math.abs(chain.atm - view.centre) > limit) {
      centre = chain.atm
      setView({ key: viewKey, centre: chain.atm })
    }
  }

  const rows = useMemo(() => {
    if (!chain || centre == null) return []
    if (strikes === "all") return chain.rows
    const reach = Number(strikes) * chain.step
    return chain.rows.filter((r) => Math.abs(r.strike - centre) <= reach)
  }, [chain, centre, strikes])

  const held = useMemo(() => {
    const map = new Map<string, Held>()
    if (!expiry) return map
    for (const l of legs) {
      if (l.expiry !== expiry.date.getTime()) continue
      const key = `${l.strike}:${l.type}`
      const prev = map.get(key)
      const net = (prev ? (prev.side === "BUY" ? prev.lots : -prev.lots) : 0) + (l.side === "BUY" ? l.lots : -l.lots)
      map.set(key, { side: net >= 0 ? "BUY" : "SELL", lots: Math.abs(net) })
    }
    return map
  }, [legs, expiry])

  const onTrade = (row: LiveRow, type: OptionType, side: Side) => {
    if (!chain) return
    const q = quoteOf(row, type)
    setLegs((prev) =>
      addLeg(prev, { type, side, strike: row.strike, lots: 1, entry: q.ltp, iv: q.iv, expiry: chain.expiry.getTime() }),
    )
    toast(`${side === "BUY" ? "Buy" : "Sell"} 1 lot · ${inst.symbol} ${formatNumber(row.strike, 0)} ${type} at ${formatPrice(q.ltp)}`, {
      id: "fo-leg",
      description: "Added to the strategy builder.",
      action: {
        label: "View",
        onClick: () => document.getElementById("strategy-builder")?.scrollIntoView({ behavior: "smooth", block: "start" }),
      },
    })
  }

  const onExpiry = (key: string) => {
    setExpiryKey(key)
    const url = new URL(window.location.href)
    url.searchParams.set("expiry", key)
    window.history.replaceState(null, "", url)
  }

  return (
    <div className="flex flex-col gap-10">
      <ChainControls
        inst={inst}
        expiries={expiries}
        expiry={expiry}
        onExpiry={onExpiry}
        strikes={strikes}
        onStrikes={setStrikes}
        unit={unit}
        onUnit={setUnit}
        greeks={greeks}
        onGreeks={setGreeks}
      />
      <ChainStats inst={inst} chain={chain} quote={quote} vix={vix} nowMs={nowMs} unit={unit} />
      <div className="@container">
        <div className="grid gap-x-10 gap-y-14 @min-[74rem]:grid-cols-[minmax(0,1fr)_380px]">
          <section className="min-w-0 border-t border-ink pt-4" aria-labelledby="chain-title">
            <div className="mb-4">
              <h2 id="chain-title" className="font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
                {expiry ? `Expiring ${formatExpiry(expiry.date, true)}` : "The chain"}
              </h2>
              <p className="mt-1 text-sm text-ink-2">
                {unit === "lakh"
                  ? "Calls on the left, puts on the right. Open interest and volume in lakh units, IV in per cent, Greeks per unit."
                  : `Calls on the left, puts on the right. Open interest and volume in contracts of ${formatNumber(inst.lot ?? 1, 0)}, IV in per cent.`}
              </p>
            </div>
            <ChainTable
              rows={rows}
              spot={chain?.spot}
              lot={chain?.lot ?? inst.lot ?? 1}
              unit={unit}
              greeks={greeks}
              atm={chain?.atm}
              maxPain={chain?.maxPain}
              held={held}
              onTrade={onTrade}
              scrollKey={`${viewKey}:${centre}`}
              symbol={inst.symbol}
            />
          </section>
          <div id="strategy-builder" className={cn("min-w-0 scroll-mt-20")}>
            <StrategyBuilder
              inst={inst}
              chain={chain}
              nowMs={nowMs}
              centre={centre}
              legs={legs}
              onLegsChange={setLegs}
            />
          </div>
        </div>
      </div>
    </div>
  )
}
