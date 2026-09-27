"use client"

import { useState } from "react"
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
} from "@/components/ui/dialog"
import { Field, FieldLabel } from "@/components/ui/field"
import { Input } from "@/components/ui/input"
import { useWatchlists, type Watchlist } from "@/lib/stores/watchlists"

/** Create a list (no `list`) or rename one. */
export function ListNameDialog({
  open,
  onOpenChange,
  list,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  list?: Watchlist
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <NameForm list={list} onDone={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  )
}

function NameForm({ list, onDone }: { list?: Watchlist; onDone: () => void }) {
  const create = useWatchlists((s) => s.create)
  const rename = useWatchlists((s) => s.rename)
  const [name, setName] = useState(list?.name ?? "")
  const trimmed = name.trim()

  return (
    <form
      className="contents"
      onSubmit={(e) => {
        e.preventDefault()
        if (!trimmed) return
        if (list) {
          rename(list.id, trimmed)
          toast(`Renamed to “${trimmed}”`)
        } else {
          create(trimmed)
          toast(`Created “${trimmed}”`)
        }
        onDone()
      }}
    >
      <DialogHeader>
        <DialogTitle>{list ? "Rename watchlist" : "New watchlist"}</DialogTitle>
        <DialogDescription>{list ? "Give the list a clearer name." : "Group instruments you want to follow together."}</DialogDescription>
      </DialogHeader>
      <Field>
        <FieldLabel htmlFor="list-name">Name</FieldLabel>
        <Input id="list-name" value={name} onChange={(e) => setName(e.target.value)} maxLength={40} autoFocus placeholder="e.g. Banks to watch" />
      </Field>
      <DialogFooter>
        <DialogClose asChild>
          <Button type="button" variant="ghost">
            Cancel
          </Button>
        </DialogClose>
        <Button type="submit" disabled={!trimmed}>
          {list ? "Save" : "Create list"}
        </Button>
      </DialogFooter>
    </form>
  )
}

export function DeleteListDialog({
  open,
  onOpenChange,
  list,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  list?: Watchlist
}) {
  const remove = useWatchlists((s) => s.remove)
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Delete “{list?.name}”?</DialogTitle>
          <DialogDescription>
            The list and its {list?.ids.length ?? 0} instruments will be removed. Alerts on those instruments stay.
          </DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <DialogClose asChild>
            <Button type="button" variant="ghost">
              Cancel
            </Button>
          </DialogClose>
          <Button
            variant="destructive"
            onClick={() => {
              if (!list) return
              remove(list.id)
              toast(`Deleted “${list.name}”`)
              onOpenChange(false)
            }}
          >
            Delete list
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
