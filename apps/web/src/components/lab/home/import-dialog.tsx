"use client"

import { useState } from "react"
import { CircleCheck, CircleX, FileUp } from "lucide-react"
import { toast } from "sonner"
import { IMPORT_EXAMPLE, parseStrategyText } from "@/lib/lab/import"
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

/** Paste a strategy in the DSL; it is checked in the browser, then saved as a version 1 draft. */
export function ImportDialog() {
  const [open, setOpen] = useState(false)
  const [text, setText] = useState("")
  const parsed = text.trim() ? parseStrategyText(text) : null
  const valid = parsed != null && parsed.errors.length === 0

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!parsed || !valid) return
    toast.success(`Imported “${parsed.name}”`, {
      description: `Saved as a ${parsed.style === "OPTIONS" ? "options" : "rules"} draft, version 1. Run it from the builder when ready.`,
    })
    setOpen(false)
    setText("")
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg">
          <FileUp /> Import
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Import a strategy</DialogTitle>
            <DialogDescription>
              Paste a definition in the lab&apos;s rules language, one clause per line. It is checked here, then parsed and versioned by the API.
            </DialogDescription>
          </DialogHeader>
          <Field>
            <div className="flex items-center justify-between gap-2">
              <FieldLabel htmlFor="import-text">Strategy definition</FieldLabel>
              <Button type="button" variant="ghost" size="sm" onClick={() => setText(IMPORT_EXAMPLE)}>
                Paste an example
              </Button>
            </div>
            <Textarea
              id="import-text"
              value={text}
              onChange={(e) => setText(e.target.value)}
              spellCheck={false}
              placeholder={'strategy  "My strategy"\nentry     rsi(close, 14) crosses_below 30\nexit      stop 5% · target 10%'}
              className="scrollbar-thin max-h-72 min-h-44 font-mono text-[11px] leading-5 whitespace-pre md:text-[11px]"
              aria-invalid={parsed != null && !valid}
              aria-describedby="import-status"
            />
            <FieldDescription>Needs at least a strategy name, an entry and an exit line. Lines starting with # are ignored.</FieldDescription>
          </Field>
          <div id="import-status" aria-live="polite" className="min-h-5 text-[11px]">
            {parsed && valid && (
              <p className="flex items-center gap-1.5 text-muted-foreground">
                <CircleCheck className="size-3.5 text-brand" />
                <span>
                  <span className="font-medium text-foreground">{parsed.name}</span> · {parsed.style === "OPTIONS" ? "options" : "rules"} ·{" "}
                  {Object.keys(parsed.fields).length} clauses
                </span>
              </p>
            )}
            {parsed && !valid && (
              <ul className="space-y-0.5 text-destructive">
                {parsed.errors.slice(0, 4).map((err) => (
                  <li key={err} className="flex items-start gap-1.5">
                    <CircleX className="mt-px size-3.5 shrink-0" />
                    {err}
                  </li>
                ))}
              </ul>
            )}
          </div>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!valid}>
              Import draft
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
