"use client"

import { useId, useLayoutEffect, useMemo, useRef } from "react"
import { Play, TriangleAlert, Wand2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Kbd, KbdGroup } from "@/components/ui/kbd"
import { cn } from "@/lib/utils"
import { FieldReference } from "./field-reference"
import { applyFix, highlight, type HighlightKind } from "./query"
import { useScreener } from "./screener-context"

/** Colours only: weights would change glyph widths and break the overlay's alignment. */
const TONE: Record<HighlightKind, string> = {
  plain: "",
  field: "text-ink",
  unknown: "text-down",
  keyword: "font-medium text-accent-ink",
  number: "text-chart-3",
  string: "text-chart-2",
  operator: "text-ink-3",
  paren: "text-ink-3",
  invalid: "text-destructive",
}

// Shared by the textarea and its mirror so the highlighted text lines up with the caret.
const TEXT = "px-3 py-2.5 font-mono text-[13px] leading-6 tracking-normal whitespace-pre-wrap break-words"
const MIN_HEIGHT = 92

/**
 * The query box: a real <textarea> (transparent text, visible caret) over a
 * mirror that paints the same text with syntax colours and error underlines.
 */
export function QueryEditor({ className }: { className?: string }) {
  const { draft, setDraft, run, applied, error, active } = useScreener()
  const textarea = useRef<HTMLTextAreaElement>(null)
  const mirror = useRef<HTMLDivElement>(null)
  const pendingCaret = useRef<number | null>(null)
  const inputId = useId()
  const hintId = useId()
  const errorId = useId()

  const segments = useMemo(() => highlight(draft, error), [draft, error])
  const dirty = draft.trim() !== applied.source.trim()

  // Grow with the text (CSS field-sizing where supported, measured otherwise).
  useLayoutEffect(() => {
    const el = textarea.current
    if (!el || CSS.supports?.("field-sizing", "content")) return
    const fit = () => {
      el.style.height = "auto"
      el.style.height = `${Math.max(el.scrollHeight, MIN_HEIGHT)}px`
    }
    fit()
    window.addEventListener("resize", fit)
    return () => window.removeEventListener("resize", fit)
  }, [draft])

  // Insert a field from the reference at the caret; focus returns to the box when the popover closes.
  const insert = (name: string) => {
    const el = textarea.current
    const start = el?.selectionStart ?? draft.length
    const end = el?.selectionEnd ?? draft.length
    const before = draft.slice(0, start)
    const after = draft.slice(end)
    const lead = before && !/[\s(]$/.test(before) ? " " : ""
    const trail = after && /^[\s)]/.test(after) ? "" : " "
    setDraft(before + lead + name + trail + after)
    pendingCaret.current = (before + lead + name + trail).length
  }

  return (
    <section className={cn("border-t border-ink pt-4", className)} aria-labelledby={`${inputId}-title`}>
      <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h2 id={`${inputId}-title`} className="font-serif text-[1.375rem] leading-tight font-semibold tracking-[-0.01em]">
            {active ? active.name : applied.empty ? "A new screen" : "Your screen"}
          </h2>
          <p className="mt-1 text-sm text-ink-2">
            {active
              ? `${active.kind === "preset" ? "A ready-made screen" : "One of your screens"}${active.description ? `: ${active.description.charAt(0).toLowerCase()}${active.description.slice(1)}` : ""}`
              : "Conditions on fundamentals, technicals and the live price."}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <FieldReference
            onInsert={insert}
            onCloseAutoFocus={(e) => {
              if (pendingCaret.current == null) return
              e.preventDefault()
              const el = textarea.current
              el?.focus()
              el?.setSelectionRange(pendingCaret.current, pendingCaret.current)
              pendingCaret.current = null
            }}
          />
          <Button onClick={() => run()}>
            <Play /> Run
          </Button>
        </div>
      </div>
      <div className="mt-4 flex flex-col gap-2.5">
      <label htmlFor={inputId} className="sr-only">
        Screen query
      </label>
      <div
        className={cn(
          "relative rounded-md border border-input bg-card transition-colors focus-within:border-ring focus-within:ring-2 focus-within:ring-ring/30",
          error && "border-down/60 focus-within:border-down/60 focus-within:ring-down/20",
        )}
      >
        <div ref={mirror} aria-hidden="true" className={cn("pointer-events-none absolute inset-0 overflow-hidden", TEXT)}>
          {segments.map((s, i) => (
            <span
              key={i}
              className={cn(TONE[s.kind], s.error && "underline decoration-down decoration-wavy decoration-1 underline-offset-[5px]")}
            >
              {s.text}
            </span>
          ))}
          {/* Keeps a trailing newline's empty line in the mirror's height. */}
          {"​"}
        </div>
        <textarea
          ref={textarea}
          id={inputId}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.ctrlKey || e.metaKey)) {
              e.preventDefault()
              run()
            }
          }}
          onScroll={(e) => {
            if (mirror.current) mirror.current.scrollTop = e.currentTarget.scrollTop
          }}
          rows={3}
          spellCheck={false}
          autoCapitalize="off"
          autoCorrect="off"
          autoComplete="off"
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${errorId} ${hintId}` : hintId}
          placeholder="roe > 15 AND pe < 30 AND debt_equity < 0.5"
          className={cn(
            "relative block min-h-[92px] w-full resize-none overflow-hidden bg-transparent text-transparent caret-ink outline-none [field-sizing:content] selection:bg-accent-ink/20 placeholder:text-ink-3",
            TEXT,
          )}
        />
      </div>

      {error && (
        <div
          id={errorId}
          role="alert"
          className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 rounded-md border border-down/30 bg-down-soft/60 px-3 py-2 text-sm text-down"
        >
          <TriangleAlert className="size-3.5 shrink-0" aria-hidden="true" />
          <p className="min-w-0 flex-1">{error.message}</p>
          {error.fix && (
            <Button
              type="button"
              size="xs"
              variant="outline"
              className="border-down/30 text-ink"
              onClick={() => run(applyFix(draft, error.fix!))}
            >
              <Wand2 /> {error.fix.label}
            </Button>
          )}
        </div>
      )}

      <div id={hintId} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-[13px] text-ink-3">
        <span className="font-mono">
          AND · OR · NOT · ( ) · &gt; &gt;= &lt; &lt;= = != · + − * /
        </span>
        <span className="flex items-center gap-1.5">
          {dirty && !error && <span className="text-accent-ink">Edited, not run yet ·</span>}
          <KbdGroup>
            <Kbd>Ctrl</Kbd>
            <Kbd>Enter</Kbd>
          </KbdGroup>
          <span>to run</span>
        </span>
      </div>
      </div>
    </section>
  )
}
