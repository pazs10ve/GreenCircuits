"use client"

import { useState } from "react"
import { FileUp, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
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
import { Field, FieldDescription, FieldLabel } from "@/components/ui/field"
import { Textarea } from "@/components/ui/textarea"
import { getInstrument } from "@greencircuits/market/catalog"
import { formatINR, formatNumber } from "@greencircuits/market/format"
import { parseHoldingsCsv, usePortfolio, type ImportResult } from "@/lib/stores/portfolio"

const EXAMPLE = `Instrument,Qty.,Avg. cost
RELIANCE,40,1286.40
HDFCBANK,120,902.15
INFY,60,1524.80`

/** Import holdings from a broker CSV. Parsing happens in the browser; nothing is uploaded. */
export function ImportDialog() {
  const replace = usePortfolio((s) => s.replace)
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const [result, setResult] = useState<ImportResult | null>(null)

  const reset = () => {
    setText("")
    setResult(null)
  }

  const readFile = async (file: File) => {
    const content = await file.text()
    setText(content)
    setResult(parseHoldingsCsv(content))
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(o) => {
        setOpen(o)
        if (!o) reset()
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <Upload /> Import holdings
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Import holdings from your broker</DialogTitle>
          <DialogDescription>
            Download your holdings as CSV (Zerodha Console, Groww or Upstox all work) and drop it here. The file is read in your
            browser and never uploaded.
          </DialogDescription>
        </DialogHeader>

        <label
          htmlFor="holdings-file"
          className="flex cursor-pointer flex-col items-center gap-1.5 rounded-lg border border-dashed bg-muted/30 px-4 py-6 text-center hover:bg-muted/50"
          onDragOver={(e) => e.preventDefault()}
          onDrop={(e) => {
            e.preventDefault()
            const file = e.dataTransfer.files[0]
            if (file) void readFile(file)
          }}
        >
          <FileUp className="size-5 text-muted-foreground" />
          <span className="text-xs font-medium">Choose a CSV file or drop it here</span>
          <span className="text-[11px] text-muted-foreground">Needs symbol, quantity and average cost columns</span>
          <input
            id="holdings-file"
            type="file"
            accept=".csv,text/csv"
            className="sr-only"
            onChange={(e) => {
              const file = e.target.files?.[0]
              if (file) void readFile(file)
            }}
          />
        </label>

        <Field>
          <FieldLabel htmlFor="holdings-text">Or paste the CSV</FieldLabel>
          <Textarea
            id="holdings-text"
            value={text}
            onChange={(e) => {
              setText(e.target.value)
              setResult(null)
            }}
            placeholder={EXAMPLE}
            className="h-28 font-mono text-[11px]"
          />
          <FieldDescription>
            <button type="button" className="text-primary hover:underline" onClick={() => setText(EXAMPLE)}>
              Use an example
            </button>
          </FieldDescription>
        </Field>

        {result && (
          <div className="space-y-2 rounded-lg border p-3 text-xs">
            <p className="font-medium">
              {result.holdings.length} {result.holdings.length === 1 ? "holding" : "holdings"} found
              {result.skipped.length > 0 && <span className="text-muted-foreground"> · {result.skipped.length} skipped</span>}
            </p>
            {result.holdings.length > 0 && (
              <ul className="num max-h-32 space-y-1 overflow-y-auto">
                {result.holdings.map((h) => (
                  <li key={h.instrumentId} className="flex justify-between gap-3">
                    <span>{getInstrument(h.instrumentId)?.symbol}</span>
                    <span className="text-muted-foreground">
                      {formatNumber(h.qty, 0)} × {formatINR(h.avgPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
            {result.skipped.length > 0 && (
              <ul className="space-y-0.5 text-[11px] text-muted-foreground">
                {result.skipped.slice(0, 4).map((s) => (
                  <li key={s}>{s}</li>
                ))}
              </ul>
            )}
          </div>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          {result && result.holdings.length > 0 ? (
            <Button
              onClick={() => {
                replace(result.holdings)
                toast.success(`Imported ${result.holdings.length} holdings`)
                setOpen(false)
                reset()
              }}
            >
              Replace my holdings
            </Button>
          ) : (
            <Button disabled={!text.trim()} onClick={() => setResult(parseHoldingsCsv(text))}>
              Check file
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
