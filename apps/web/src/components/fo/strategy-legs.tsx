"use client"

import { Minus, Plus, X } from "lucide-react"
import { formatDateIST, formatNumber, formatPrice } from "@greencircuits/market/format"
import { Button } from "@/components/ui/button"
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip"
import { cn } from "@/lib/utils"
import { MAX_LOTS, PRESETS, type PresetKey, type StrategyLeg } from "./legs"

export function PresetPicker({ onPick, disabled }: { onPick: (key: PresetKey) => void; disabled?: boolean }) {
  return (
    <div className="flex flex-wrap gap-1.5" role="group" aria-label="Strategy presets">
      {PRESETS.map((p) => (
        <Tooltip key={p.key}>
          <TooltipTrigger asChild>
            <Button variant="outline" size="sm" disabled={disabled} onClick={() => onPick(p.key)}>
              {p.label}
            </Button>
          </TooltipTrigger>
          <TooltipContent side="bottom">{p.hint}</TooltipContent>
        </Tooltip>
      ))}
    </div>
  )
}

/** Editable list of legs: side, lots, strike and type, expiry, entry price. */
export function LegsList({ legs, onChange }: { legs: StrategyLeg[]; onChange: (legs: StrategyLeg[]) => void }) {
  const update = (id: string, patch: Partial<StrategyLeg>) => onChange(legs.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  return (
    <div>
      <div className="grid grid-cols-[28px_76px_minmax(0,1fr)_64px_24px] items-center gap-2 border-b border-rule-strong pb-2 text-xs text-ink-3">
        <span>Side</span>
        <span className="text-center">Lots</span>
        <span>Contract</span>
        <span className="text-right">Entry</span>
        <span className="sr-only">Remove</span>
      </div>
      <ul className="divide-y divide-rule border-b border-rule">
        {legs.map((l) => {
          const name = `${formatNumber(l.strike, 0)} ${l.type}`
          return (
            <li key={l.id} className="grid grid-cols-[28px_76px_minmax(0,1fr)_64px_24px] items-center gap-2 py-1.5">
              <button
                type="button"
                onClick={() => update(l.id, { side: l.side === "BUY" ? "SELL" : "BUY" })}
                aria-label={`${l.side === "BUY" ? "Buying" : "Selling"} ${name}. Switch to ${l.side === "BUY" ? "sell" : "buy"}`}
                className={cn(
                  "flex h-6 w-7 cursor-pointer items-center justify-center rounded-md text-[11px] font-semibold transition-colors",
                  l.side === "BUY" ? "bg-primary text-primary-foreground hover:bg-primary/85" : "border bg-background text-foreground hover:bg-muted",
                )}
              >
                {l.side === "BUY" ? "B" : "S"}
              </button>
              <div className="flex h-6 items-center rounded-md border" role="group" aria-label={`Lots for ${name}`}>
                <button
                  type="button"
                  onClick={() => update(l.id, { lots: Math.max(1, l.lots - 1) })}
                  disabled={l.lots <= 1}
                  aria-label="One lot fewer"
                  className="flex h-full w-6 cursor-pointer items-center justify-center text-ink-3 hover:text-ink disabled:cursor-default disabled:opacity-40"
                >
                  <Minus className="size-3" />
                </button>
                <span className="num flex-1 text-center text-xs font-medium" aria-live="polite">
                  {l.lots}
                </span>
                <button
                  type="button"
                  onClick={() => update(l.id, { lots: Math.min(MAX_LOTS, l.lots + 1) })}
                  disabled={l.lots >= MAX_LOTS}
                  aria-label="One lot more"
                  className="flex h-full w-6 cursor-pointer items-center justify-center text-ink-3 hover:text-ink disabled:cursor-default disabled:opacity-40"
                >
                  <Plus className="size-3" />
                </button>
              </div>
              <span className="min-w-0 truncate text-xs">
                <span className="num font-medium">{formatNumber(l.strike, 0)}</span>{" "}
                <span className="font-medium">{l.type}</span>
                <span className="num text-ink-3"> · {formatDateIST(l.expiry, "short")}</span>
              </span>
              <span className="num text-right text-xs">{formatPrice(l.entry)}</span>
              <Button
                variant="ghost"
                size="icon-xs"
                onClick={() => onChange(legs.filter((x) => x.id !== l.id))}
                aria-label={`Remove ${name}`}
              >
                <X />
              </Button>
            </li>
          )
        })}
      </ul>
    </div>
  )
}
