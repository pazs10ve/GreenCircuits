"use client"

import { useRouter } from "next/navigation"
import type { Instrument } from "@greencircuits/market/types"
import { Label } from "@/components/ui/label"
import { Select, SelectContent, SelectGroup, SelectItem, SelectLabel, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { Segmented } from "@/components/market/segmented"
import { FO_UNDERLYINGS, formatExpiry, type OiUnit } from "./chain-model"
import type { ExpiryOption } from "./use-option-chain"

export type StrikeWindow = "10" | "15" | "20" | "all"

const WINDOWS = [
  { value: "10", label: "±10" },
  { value: "15", label: "±15" },
  { value: "20", label: "±20" },
  { value: "all", label: "All" },
] as const

const UNITS = [
  { value: "lakh", label: "Lakh" },
  { value: "contracts", label: "Contracts" },
] as const

export function ChainControls({
  inst,
  expiries,
  expiry,
  onExpiry,
  strikes,
  onStrikes,
  unit,
  onUnit,
  greeks,
  onGreeks,
}: {
  inst: Instrument
  expiries: ExpiryOption[]
  expiry: ExpiryOption | undefined
  onExpiry: (key: string) => void
  strikes: StrikeWindow
  onStrikes: (value: StrikeWindow) => void
  unit: OiUnit
  onUnit: (value: OiUnit) => void
  greeks: boolean
  onGreeks: (value: boolean) => void
}) {
  const router = useRouter()
  const indices = FO_UNDERLYINGS.filter((i) => i.kind === "INDEX")
  const stocks = FO_UNDERLYINGS.filter((i) => i.kind !== "INDEX")

  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <Select value={inst.slug} onValueChange={(slug) => router.push(`/fo/${slug}`)}>
          <SelectTrigger aria-label="Underlying" className="h-9 w-[160px] bg-card font-medium">
            <SelectValue />
          </SelectTrigger>
          <SelectContent position="popper" align="start">
            <SelectGroup>
              <SelectLabel>Indices</SelectLabel>
              {indices.map((i) => (
                <SelectItem key={i.id} value={i.slug}>
                  {i.symbol}
                </SelectItem>
              ))}
            </SelectGroup>
            <SelectGroup>
              <SelectLabel>Stocks</SelectLabel>
              {stocks.map((i) => (
                <SelectItem key={i.id} value={i.slug}>
                  {i.symbol}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>

        {expiry ? (
          <Select value={expiry.key} onValueChange={onExpiry}>
            <SelectTrigger aria-label="Expiry" className="h-9 w-[210px] bg-card">
              <SelectValue />
            </SelectTrigger>
            <SelectContent position="popper" align="start">
              {expiries.map((e) => (
                <SelectItem key={e.key} value={e.key}>
                  <span className="num">{formatExpiry(e.date, true)}</span>
                  <span className="text-xs text-ink-3">{e.monthly ? "monthly" : "weekly"}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        ) : (
          <Skeleton className="h-9 w-[210px]" />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2 md:ml-auto">
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-3">Strikes</span>
          <Segmented value={strikes} onChange={onStrikes} options={WINDOWS} aria-label="Strikes around the money" />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-[13px] text-ink-3">OI in</span>
          <Segmented value={unit} onChange={onUnit} options={UNITS} aria-label="Open interest and volume unit" />
        </div>
        <div className="flex items-center gap-2">
          <Switch id="chain-greeks" checked={greeks} onCheckedChange={onGreeks} />
          <Label htmlFor="chain-greeks" className="text-[13px] font-normal text-ink-2">
            Greeks
          </Label>
        </div>
      </div>
    </div>
  )
}
