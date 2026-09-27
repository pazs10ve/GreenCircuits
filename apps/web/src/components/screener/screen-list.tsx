"use client"

import { useMemo } from "react"
import { Trash2 } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Panel } from "@/components/shell/page-header"
import { useQuoteReader } from "@/lib/stream/hooks"
import { cn } from "@/lib/utils"
import { PRESETS } from "./presets"
import { compileQuery } from "./query"
import { useSavedScreens } from "./saved-screens"
import { toLiveRows, useScreener } from "./screener-context"

/** Preset and saved screens, each with its current match count. Stacks into swipeable rows on small screens. */
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
    <Panel className={className} title="Screens" description="Presets and the screens you save" bodyClassName="py-2">
      <SectionLabel>Presets</SectionLabel>
      <ul className="no-scrollbar flex gap-1.5 overflow-x-auto px-2 pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
        {PRESETS.map((p) => (
          <li key={p.id} className="w-56 shrink-0 lg:w-auto">
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

      <SectionLabel className="mt-2 border-t pt-3">Saved</SectionLabel>
      {saved.length === 0 ? (
        <p className="px-4 pb-2 text-[11px] leading-relaxed text-muted-foreground">
          Screens you save appear here. They stay in this browser.
        </p>
      ) : (
        <ul className="no-scrollbar flex gap-1.5 overflow-x-auto px-2 pb-1 lg:flex-col lg:gap-0.5 lg:overflow-visible">
          {saved.map((s) => (
            <li key={s.id} className="group/saved relative w-56 shrink-0 lg:w-auto">
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
                className="absolute top-1.5 right-1.5 text-muted-foreground opacity-100 hover:text-destructive lg:opacity-0 lg:group-hover/saved:opacity-100 lg:focus-visible:opacity-100"
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
    </Panel>
  )
}

function SectionLabel({ children, className }: { children: React.ReactNode; className?: string }) {
  return <h3 className={cn("px-4 pb-1.5 text-[10px] font-medium tracking-wide text-muted-foreground uppercase", className)}>{children}</h3>
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
        "flex h-full w-full flex-col gap-0.5 rounded-md border px-2.5 py-2 text-left transition-colors outline-none hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-ring/40 lg:border-transparent",
        active && "border-primary/40 bg-primary/5 hover:bg-primary/10 lg:border-primary/30",
        className,
      )}
    >
      <span className="flex items-center justify-between gap-2">
        <span className={cn("truncate text-xs font-medium", active && "text-primary")}>{name}</span>
        {count === undefined ? (
          <Skeleton className="h-3.5 w-5 shrink-0" />
        ) : (
          <span className="num shrink-0 text-[11px] text-muted-foreground" title={count === null ? "This query has an error" : `${count} stocks match`}>
            {count === null ? "!" : count}
          </span>
        )}
      </span>
      <span className={cn("line-clamp-2 text-[11px] leading-snug text-muted-foreground", mono && "font-mono text-[10.5px]")}>{detail}</span>
    </button>
  )
}
