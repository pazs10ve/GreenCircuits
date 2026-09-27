"use client"

import { useState } from "react"
import { BellPlus } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog"
import { Field, FieldGroup, FieldLabel, FieldLegend, FieldSet } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select"
import { Switch } from "@/components/ui/switch"
import { getInstrument } from "@greencircuits/market/catalog"
import type { Instrument } from "@greencircuits/market/types"
import { formatPct, formatPrice, decimalsForTick } from "@greencircuits/market/format"
import { quoteStore } from "@/lib/stream/store"
import { CONDITION_LABEL, isPercent, useAlerts, type AlertChannel, type AlertCondition } from "@/lib/stores/alerts"
import { LiveChange, LivePrice } from "./price"

const CHANNELS: { value: AlertChannel; label: string }[] = [
  { value: "IN_APP", label: "In-app" },
  { value: "EMAIL", label: "Email" },
  { value: "TELEGRAM", label: "Telegram" },
]

function suggest(inst: Instrument, c: AlertCondition): string {
  const ltp = quoteStore.get(inst.id)?.ltp ?? inst.prevClose
  const decimals = decimalsForTick(inst.tick)
  if (c === "PRICE_ABOVE") return (ltp * 1.02).toFixed(decimals)
  if (c === "PRICE_BELOW") return (ltp * 0.98).toFixed(decimals)
  return c === "CHANGE_ABOVE" ? "2" : "-2"
}

/**
 * Create a price or day-change alert for one instrument. Uncontrolled with a
 * trigger button by default; pass `open`/`onOpenChange` and `trigger={null}`
 * to drive it from elsewhere.
 */
export function AlertDialogButton({
  instrumentId,
  trigger,
  open,
  onOpenChange,
}: {
  instrumentId: number
  trigger?: React.ReactNode | null
  open?: boolean
  onOpenChange?: (open: boolean) => void
}) {
  const [innerOpen, setInnerOpen] = useState(false)
  const controlled = open !== undefined
  const isOpen = controlled ? open : innerOpen
  const setOpen = (next: boolean) => {
    if (!controlled) setInnerOpen(next)
    onOpenChange?.(next)
  }

  return (
    <Dialog open={isOpen} onOpenChange={setOpen}>
      {trigger !== null && (
        <DialogTrigger asChild>
          {trigger ?? (
            <Button variant="outline" size="lg">
              <BellPlus /> Alert
            </Button>
          )}
        </DialogTrigger>
      )}
      <DialogContent className="sm:max-w-md">
        {/* Mounted on open, so the form starts fresh from the live price each time. */}
        <AlertForm instrumentId={instrumentId} onDone={() => setOpen(false)} />
      </DialogContent>
    </Dialog>
  )
}

function AlertForm({ instrumentId, onDone }: { instrumentId: number; onDone: () => void }) {
  const inst = getInstrument(instrumentId)!
  const create = useAlerts((s) => s.create)
  const [condition, setCondition] = useState<AlertCondition>("PRICE_ABOVE")
  const [value, setValue] = useState(() => suggest(inst, "PRICE_ABOVE"))
  const [channels, setChannels] = useState<AlertChannel[]>(["IN_APP"])
  const [repeat, setRepeat] = useState(false)
  const [note, setNote] = useState("")

  const numeric = Number(value)
  const valid = value.trim() !== "" && Number.isFinite(numeric) && (isPercent(condition) || numeric > 0) && channels.length > 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!valid) return
    create({ instrumentId, condition, value: numeric, channels, repeat, note: note.trim() || undefined })
    const shown = isPercent(condition) ? formatPct(numeric) : `₹${formatPrice(numeric, inst.tick)}`
    toast.success(`Alert set: ${inst.symbol} ${CONDITION_LABEL[condition].toLowerCase()} ${shown}`)
    onDone()
  }

  return (
    <form onSubmit={submit} className="contents">
      <DialogHeader>
        <DialogTitle>New alert · {inst.symbol}</DialogTitle>
        <DialogDescription className="flex items-center gap-2">
          <span>Now</span>
          <LivePrice id={instrumentId} className="font-medium text-foreground" />
          <LiveChange id={instrumentId} className="text-[11px]" />
        </DialogDescription>
      </DialogHeader>
      <FieldGroup className="gap-4">
        <div className="grid grid-cols-[1fr_120px] gap-3">
          <Field>
            <FieldLabel htmlFor="alert-condition">Condition</FieldLabel>
            <Select
              value={condition}
              onValueChange={(v) => {
                const c = v as AlertCondition
                setCondition(c)
                setValue(suggest(inst, c))
              }}
            >
              <SelectTrigger id="alert-condition" className="w-full">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(CONDITION_LABEL) as AlertCondition[]).map((c) => (
                  <SelectItem key={c} value={c}>
                    {CONDITION_LABEL[c]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
          <Field>
            <FieldLabel htmlFor="alert-value">{isPercent(condition) ? "Change %" : "Price ₹"}</FieldLabel>
            <Input
              id="alert-value"
              inputMode="decimal"
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="num"
              aria-invalid={value !== "" && !valid}
            />
          </Field>
        </div>
        <FieldSet>
          <FieldLegend variant="label">Notify me by</FieldLegend>
          <div className="flex flex-wrap gap-4">
            {CHANNELS.map((c) => (
              <Field key={c.value} orientation="horizontal" className="w-auto">
                <Checkbox
                  id={`alert-ch-${c.value}`}
                  checked={channels.includes(c.value)}
                  onCheckedChange={(on) => setChannels((prev) => (on ? [...prev, c.value] : prev.filter((x) => x !== c.value)))}
                />
                <FieldLabel htmlFor={`alert-ch-${c.value}`} className="font-normal">
                  {c.label}
                </FieldLabel>
              </Field>
            ))}
          </div>
        </FieldSet>
        <Field orientation="horizontal">
          <Switch id="alert-repeat" checked={repeat} onCheckedChange={setRepeat} />
          <FieldLabel htmlFor="alert-repeat" className="font-normal">
            Re-arm after it triggers (at most once a day)
          </FieldLabel>
        </Field>
        <Field>
          <FieldLabel htmlFor="alert-note">Note (optional)</FieldLabel>
          <Input id="alert-note" value={note} onChange={(e) => setNote(e.target.value)} placeholder="Why this level matters" />
        </Field>
      </FieldGroup>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!valid}>
          Create alert
        </Button>
      </DialogFooter>
    </form>
  )
}
