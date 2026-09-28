"use client"

import { useState } from "react"
import { ChevronsUpDown } from "lucide-react"
import { toast } from "sonner"
import { InstrumentPicker } from "@/components/market/instrument-picker"
import { LivePrice } from "@/components/market/price"
import { Button } from "@/components/ui/button"
import { Dialog, DialogClose, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog"
import { Field, FieldDescription, FieldGroup, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { getInstrument } from "@greencircuits/market/catalog"
import { decimalsForTick, formatINR, formatNumber } from "@greencircuits/market/format"
import type { Instrument } from "@greencircuits/market/types"
import { usePortfolio, type Holding } from "@/lib/stores/portfolio"
import { quoteStore } from "@/lib/stream/store"

/**
 * Add a holding by hand, or correct one: the company, how many shares, and
 * what they cost on average. Adding a company already held tops it up at the
 * combined average cost; the first holding added to the sample starts a
 * portfolio of the reader's own.
 */
export function HoldingDialog({ open, onOpenChange, holding }: { open: boolean; onOpenChange: (open: boolean) => void; holding?: Holding }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        {/* Mounted on open, so each add starts empty and each edit starts from the holding. */}
        {open && <HoldingForm holding={holding} onDone={() => onOpenChange(false)} />}
      </DialogContent>
    </Dialog>
  )
}

const priceOf = (inst: Instrument) => quoteStore.get(inst.id)?.ltp ?? inst.prevClose

function HoldingForm({ holding, onDone }: { holding?: Holding; onDone: () => void }) {
  const holdings = usePortfolio((s) => s.holdings)
  const source = usePortfolio((s) => s.source)
  const add = usePortfolio((s) => s.add)
  const update = usePortfolio((s) => s.update)
  const [inst, setInst] = useState<Instrument | undefined>(() => (holding ? getInstrument(holding.instrumentId) : undefined))
  const [qty, setQty] = useState(holding ? String(holding.qty) : "")
  const [avg, setAvg] = useState(holding ? String(holding.avgPrice) : "")

  const shares = Number(qty)
  const cost = Number(avg)
  const sharesOk = Number.isInteger(shares) && shares > 0 && shares <= 1e9
  const costOk = Number.isFinite(cost) && cost > 0 && cost <= 1e7
  const valid = inst != null && sharesOk && costOk
  // Adding a company already held adds to it.
  const held = !holding && inst ? holdings.find((h) => h.instrumentId === inst.id) : undefined
  const combined = held && valid ? (held.avgPrice * held.qty + cost * shares) / (held.qty + shares) : null

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    if (holding) {
      update(holding.instrumentId, { qty: shares, avgPrice: cost })
      toast.success(`Updated ${inst.name}`)
    } else {
      const result = add({ instrumentId: inst.id, qty: shares, avgPrice: cost })
      if (result === "started") toast.success(`Started your own portfolio with ${inst.name}`, { description: "The sample is set aside; you can bring it back from the page's menu." })
      else if (result === "topped-up") toast.success(`Added ${formatNumber(shares, 0)} shares to ${inst.name}`)
      else toast.success(`Added ${inst.name}`)
    }
    onDone()
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>{holding ? `Edit ${inst?.name ?? "holding"}` : "Add a holding"}</DialogTitle>
        <DialogDescription>
          {holding
            ? "Correct the number of shares or what they cost on average."
            : source === "sample"
              ? "Your first holding starts a portfolio of your own, in place of the sample."
              : "Shares you own, and what they cost on average."}
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor="holding-company">Company</FieldLabel>
          {holding ? (
            <p id="holding-company" className="flex items-baseline justify-between gap-3 rounded-md border border-input px-3 py-2 text-sm">
              <span className="truncate font-medium">{inst?.name}</span>
              {inst && <LivePrice id={inst.id} className="shrink-0 text-ink-2" />}
            </p>
          ) : (
            <InstrumentPicker
              stocksOnly
              align="start"
              placeholder="Search a company or symbol…"
              onSelect={(picked) => {
                setInst(picked)
                // A reasonable start for the cost: today's price, to be changed to what was paid.
                if (!avg) setAvg(priceOf(picked).toFixed(decimalsForTick(picked.tick)))
              }}
              trigger={
                <Button id="holding-company" type="button" variant="outline" className="w-full justify-between font-normal">
                  <span className={inst ? "truncate text-ink" : "text-ink-3"}>{inst ? `${inst.name} · ${inst.symbol}` : "Choose a company"}</span>
                  <ChevronsUpDown className="opacity-50" />
                </Button>
              }
            />
          )}
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <FieldLabel htmlFor="holding-qty">Shares</FieldLabel>
            <Input
              id="holding-qty"
              inputMode="numeric"
              autoFocus={!!holding}
              value={qty}
              onChange={(e) => setQty(e.target.value.replace(/[^\d]/g, ""))}
              className="num"
              aria-invalid={qty !== "" && !sharesOk}
            />
          </Field>
          <Field>
            <FieldLabel htmlFor="holding-avg">Average cost ₹</FieldLabel>
            <Input
              id="holding-avg"
              inputMode="decimal"
              value={avg}
              onChange={(e) => setAvg(e.target.value.replace(/[^\d.]/g, ""))}
              className="num"
              aria-invalid={avg !== "" && !costOk}
            />
          </Field>
        </div>
        {valid && (
          <FieldDescription className="num">
            Cost {formatINR(shares * cost, 0)} · worth {formatINR(shares * priceOf(inst), 0)} at today&apos;s price
            {held && combined != null && (
              <>
                <br />
                You hold {formatNumber(held.qty, 0)} already; together that&apos;s {formatNumber(held.qty + shares, 0)} shares at {formatINR(combined, 2)} on average.
              </>
            )}
          </FieldDescription>
        )}
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!valid}>
          {holding ? "Save" : held ? "Add to holding" : "Add holding"}
        </Button>
      </DialogFooter>
    </form>
  )
}
