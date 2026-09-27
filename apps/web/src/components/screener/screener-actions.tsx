"use client"

import Link from "next/link"
import { useId, useState } from "react"
import { BookmarkPlus, Download, FlaskConical } from "lucide-react"
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
import { Field, FieldDescription, FieldGroup, FieldLabel, FieldTitle } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { quoteStore } from "@/lib/stream/store"
import { getField } from "./fields"
import { downloadCsv, screenToCsv } from "./csv"
import { useSavedScreens } from "./saved-screens"
import { toLiveRows, useScreener } from "./screener-context"

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "screen"
}

/** Save, export and backtest the screen that is currently applied. */
export function ScreenerActions() {
  const { applied, active, rows, columns } = useScreener()

  const exportCsv = () => {
    // Prices as of the click, straight from the store (this is an event handler, not render).
    const matches = toLiveRows(rows, (id) => quoteStore.get(id))
      .filter(applied.test)
      .sort((a, b) => b.mcapCr - a.mcapCr)
    const fields = [getField("sector"), ...columns.filter((c) => c !== "sector").map(getField)]
    const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Kolkata" }).format(new Date())
    const filename = `greencircuits-${slug(active?.name ?? (applied.empty ? "all-stocks" : "custom-screen"))}-${date}.csv`
    downloadCsv(screenToCsv(matches, fields), filename)
    toast.success(`Exported ${matches.length} ${matches.length === 1 ? "stock" : "stocks"}`, { description: filename })
  }

  return (
    <>
      <SaveScreenButton />
      <Button variant="outline" size="lg" onClick={exportCsv}>
        <Download /> Export CSV
      </Button>
      <Button size="lg" asChild>
        <Link href={`/lab/new?screen=${encodeURIComponent(applied.source.trim())}`}>
          <FlaskConical /> Backtest this screen
        </Link>
      </Button>
    </>
  )
}

function SaveScreenButton() {
  const { applied, draft, active } = useScreener()
  const saved = useSavedScreens((s) => s.screens)
  const save = useSavedScreens((s) => s.save)
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const nameId = useId()
  const unsaved = draft.trim() !== applied.source.trim()

  const onOpenChange = (next: boolean) => {
    if (next) setName(active?.name ?? `My screen ${saved.length + 1}`)
    setOpen(next)
  }

  const submit = (e: React.FormEvent) => {
    e.preventDefault()
    const trimmed = name.trim()
    if (!trimmed || applied.empty) return
    save(trimmed, applied.source.trim())
    toast.success(`Saved “${trimmed}”`, { description: "Find it under Saved screens. It stays in this browser." })
    setOpen(false)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogTrigger asChild>
        <Button variant="outline" size="lg" disabled={applied.empty}>
          <BookmarkPlus /> Save screen
        </Button>
      </DialogTrigger>
      <DialogContent className="sm:max-w-md">
        <form onSubmit={submit} className="contents">
          <DialogHeader>
            <DialogTitle>Save screen</DialogTitle>
            <DialogDescription>Saved screens stay in this browser and appear in the screens list.</DialogDescription>
          </DialogHeader>
          <FieldGroup className="gap-3">
            <Field>
              <FieldLabel htmlFor={nameId}>Name</FieldLabel>
              <Input id={nameId} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoFocus />
            </Field>
            <Field>
              <FieldTitle>Query</FieldTitle>
              <pre className="rounded-md border bg-muted/40 px-2.5 py-2 font-mono text-[12px] leading-relaxed break-words whitespace-pre-wrap">
                {applied.source.trim()}
              </pre>
              {unsaved && (
                <FieldDescription>This is the last query you ran. Run your edits first if you want to save them instead.</FieldDescription>
              )}
            </Field>
          </FieldGroup>
          <DialogFooter>
            <DialogClose asChild>
              <Button type="button" variant="ghost">
                Cancel
              </Button>
            </DialogClose>
            <Button type="submit" disabled={!name.trim()}>
              Save screen
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  )
}
