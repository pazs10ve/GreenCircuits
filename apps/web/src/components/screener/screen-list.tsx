"use client"

import { useMemo } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { useQuoteReader } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"
import { PRESETS } from "./presets"
import { compileQuery } from "./query"
import { useSavedScreens } from "./saved-screens"
import { toLiveRows, useScreener } from "./screener-context"

/**
 * Ready-made screens and the ones you saved, each with how many companies
 * match it now. A column on wide screens, a row you swipe on small ones.
 */
export function ScreenList({ className }: { className?: string }) {
  const { rows, run, active } = useScreener()
  const saved = useSavedScreens((s) => s.screens)
  const remove = useSavedScreens((s) => s.remove)
  const read = useQuoteReader(3000)

  const counts = useMemo(() => {
    const live = toLiveRows(rows, read)
    const ready = read(rows[0]!.id) != null
    const out = new Map<string, number | null | undefined>()
    for (const s of [...PRESETS, ...saved]) {
      const c = compileQuery(s.query)
      // null: the query no longer compiles; undefined: waiting for live prices.
      out.set(s.id, !c.ok ? null : c.usesLive && !ready ? undefined : live.filter(c.test).length)
    }
    return out
  }, [rows, read, saved])

  return (
    <nav aria-label="Screens" className={className}>
      <Heading>Ready-made screens</Heading>
      <ul className="no-scrollbar -mx-5 flex gap-6 overflow-x-auto px-5 lg:mx-0 lg:block lg:overflow-visible lg:px-0">
        {PRESETS.map((p) => (
          <li key={p.id} className="w-60 shrink-0 lg:w-auto lg:border-b lg:border-rule">
            <ScreenButton
              name={p.name}
              detail={p.description}
              count={counts.get(p.id)}
              active={active?.kind === "preset" && active.id === p.id}
              onClick={() => run(p.query)}
            />
          </li>
        ))}
      </ul>

      <Heading className="mt-8">Your screens</Heading>
      {saved.length === 0 ? (
        <p className="py-3 text-sm leading-relaxed text-ink-2">Screens you save show up here. They stay in this browser.</p>
      ) : (
        <ul className="no-scrollbar -mx-5 flex gap-6 overflow-x-auto px-5 lg:mx-0 lg:block lg:overflow-visible lg:px-0">
          {saved.map((s) => (
            <li key={s.id} className="group/saved relative w-60 shrink-0 lg:w-auto lg:border-b lg:border-rule">
              <ScreenButton
                name={s.name}
                detail={s.query}
                mono
                count={counts.get(s.id)}
                active={active?.kind === "saved" && active.id === s.id}
                onClick={() => run(s.query)}
                className="pr-8"
              />
              <Button
                variant="ghost"
                size="icon-xs"
                className="absolute top-2.5 right-0 text-ink-3 opacity-100 hover:text-down lg:opacity-0 lg:group-hover/saved:opacity-100 lg:focus-visible:opacity-100"
                aria-label={`Delete saved screen ${s.name}`}
                onClick={() => {
                  remove(s.id)
                  toast(`Deleted “${s.name}”`)
                }}
              >
                <Trash2 />
              </Button>
            </li>
          ))}
        </ul>
      )}
    </nav>
  )
}

function Heading({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h2 className={cn("border-b border-ink pb-2 text-sm font-semibold", className)}>{children}</h2>
}

function ScreenButton({
  name,
  detail,
  count,
  active,
  mono,
  onClick,
  className,
}: {
  name: string
  detail: string
  count: number | null | undefined
  active: boolean
  mono?: boolean
  onClick: () => void
  className?: string
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={active ? "true" : undefined}
      className={cn(
        "group flex w-full flex-col gap-1 py-3 text-left outline-none focus-visible:ring-2 focus-visible:ring-ring/40",
        active && "-mx-2 w-[calc(100%+1rem)] bg-surface px-2",
        className,
      )}
    >
      <span className="flex items-baseline justify-between gap-3">
        <span className={cn("text-[0.9375rem] group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4", active ? "font-semibold" : "font-medium")}>
          {name}
        </span>
        {count === undefined ? (
          <Skeleton className="h-3.5 w-5 shrink-0" />
        ) : (
          <span className={cn("num shrink-0 text-sm", count === null ? "text-down" : "text-ink-3")} title={count === null ? "This query has an error" : `${count} companies match`}>
            {count === null ? "error" : count}
          </span>
        )}
      </span>
      <span className={cn("line-clamp-2 text-sm leading-snug text-ink-2", mono && "font-mono text-[13px]")}>{detail}</span>
    </button>
  )
}
