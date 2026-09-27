"use client"

import { useId, useState } from "react"
import { BookOpen, Search } from "lucide-react"
import { Button } from "@/components/ui/button"
import { InputGroup, InputGroupAddon, InputGroupInput } from "@/components/ui/input-group"
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover"
import { FIELD_GROUPS, FIELDS } from "./fields"

/** Every field the query language knows, with units. Clicking one inserts it into the editor. */
export function FieldReference({
  onInsert,
  onCloseAutoFocus,
}: {
  onInsert: (name: string) => void
  onCloseAutoFocus?: (event: Event) => void
}) {
  const [open, setOpen] = useState(false)
  const [filter, setFilter] = useState("")
  const searchId = useId()
  const q = filter.trim().toLowerCase()
  const shown = FIELDS.filter(
    (f) => !q || [f.name, f.title, f.description, ...(f.aliases ?? [])].some((s) => s.toLowerCase().includes(q)),
  )

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next)
        if (!next) setFilter("")
      }}
    >
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm">
          <BookOpen /> Fields
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[min(440px,calc(100vw-2rem))] gap-0 p-0" onCloseAutoFocus={onCloseAutoFocus}>
        <div className="space-y-2 border-b p-2.5">
          <label htmlFor={searchId} className="sr-only">
            Search fields
          </label>
          <InputGroup>
            <InputGroupAddon>
              <Search />
            </InputGroupAddon>
            <InputGroupInput id={searchId} value={filter} onChange={(e) => setFilter(e.target.value)} placeholder="Search fields, e.g. debt or yield" />
          </InputGroup>
          <p className="text-[11px] leading-relaxed text-muted-foreground">
            Compare with <Code>&gt; &gt;= &lt; &lt;= = !=</Code>, join with <Code>AND</Code> <Code>OR</Code> <Code>NOT</Code> and{" "}
            <Code>( )</Code>, calculate with <Code>+ − * /</Code>. A condition on a missing value never matches.
          </p>
        </div>
        <div className="scrollbar-thin max-h-[min(420px,55vh)] overflow-y-auto pb-1">
          {shown.length === 0 && <p className="px-3 py-6 text-center text-muted-foreground">No field matches “{filter}”.</p>}
          {FIELD_GROUPS.map((group) => {
            const fields = shown.filter((f) => f.group === group)
            if (fields.length === 0) return null
            return (
              <section key={group} aria-label={group}>
                <h3 className="sticky top-0 z-10 bg-popover px-3 pt-2.5 pb-1 text-[10px] font-medium tracking-wide text-muted-foreground uppercase">
                  {group}
                </h3>
                <ul>
                  {fields.map((f) => (
                    <li key={f.name}>
                      <button
                        type="button"
                        onClick={() => {
                          onInsert(f.name)
                          setOpen(false)
                        }}
                        className="grid w-full grid-cols-[1fr_auto] items-start gap-x-3 px-3 py-1.5 text-left outline-none hover:bg-muted focus-visible:bg-muted"
                        aria-label={`Insert ${f.name}: ${f.title}`}
                      >
                        <span className="min-w-0">
                          <span className="flex items-center gap-1.5">
                            <span className="font-mono text-[12px] font-medium text-foreground">{f.name}</span>
                            {f.live && (
                              <span className="rounded-sm border border-primary/40 px-1 font-mono text-[9px] tracking-wide text-primary uppercase">
                                Live
                              </span>
                            )}
                          </span>
                          <span className="block text-[11px] leading-snug text-muted-foreground">
                            <span className="text-foreground/80">{f.title}.</span> {f.description}
                          </span>
                        </span>
                        <span className="num pt-0.5 text-[11px] whitespace-nowrap text-muted-foreground">{f.unit}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )
          })}
        </div>
        <p className="border-t px-3 py-2 text-[11px] text-muted-foreground">
          Click a field to insert it at the cursor. Ratios use the last close; fields marked live follow the price feed.
        </p>
      </PopoverContent>
    </Popover>
  )
}

function Code({ children }: { children: React.ReactNode }) {
  return <code className="rounded-sm bg-muted px-1 font-mono text-[11px] text-foreground">{children}</code>
}
