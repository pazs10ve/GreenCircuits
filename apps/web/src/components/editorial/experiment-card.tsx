import Link from "next/link"
import type { Route } from "next"
import { ChevronRight } from "lucide-react"
import type { Experiment } from "@greencircuits/market/research/experiments"
import { Result } from "@/components/parts/tag"
import { MiniLines } from "@/components/viz/mini-lines"
import { PricesNote } from "./prices-note"
import { cn } from "@/lib/utils"

function lakh(v: number): string {
  return v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : `₹${(v / 1e5).toFixed(1)} L`
}

/** The answer's first sentence: the result, without the reasoning after it. */
function verdict(answer: string): string {
  return answer.match(/^.+?[.!?](?=\s|$)/)?.[0] ?? answer
}

/** Who ended with more, and by how much: a test's result in a few words, for the lab's chip. */
export function resultOf(e: Experiment): string {
  const a = e.lines[0].points.at(-1)!.v
  const b = e.lines[1].points.at(-1)!.v
  const gap = Math.abs(a - b)
  if (gap / Math.max(a, b, 1) < 0.01) return "About level"
  return `${e.names[a >= b ? 0 : 1]} ahead by ${lakh(gap)}`
}

/**
 * One "would it have worked?" result: the question, the two ways of investing
 * as lines (the one that ended with more in the lab's green), what each ended
 * up worth, and the result as a chip. The full card adds the numbers and how
 * it was tested, a click away.
 */
export function ExperimentCard({ experiment: e, compact = false, className }: { experiment: Experiment; compact?: boolean; className?: string }) {
  const values = e.lines.map((l) => l.points.at(-1)!.v)
  const winner = values[0]! >= values[1]! ? 0 : 1
  return (
    <article className={cn("flex flex-col rounded-panel bg-panel p-4", className)}>
      <h3 className="font-serif text-[1.0625rem] leading-snug font-semibold">{e.question}</h3>
      <MiniLines
        className="mt-3"
        height={compact ? 88 : 112}
        labels={false}
        ariaLabel={`${e.names[0]} against ${e.names[1]}, ${e.period}`}
        lines={e.lines.map((l, i) => ({
          id: l.id,
          label: l.label,
          points: l.points,
          color: i === winner ? "var(--brand)" : "var(--ink-3)",
          width: i === winner ? 2.25 : 1.5,
          dashed: i !== winner,
        }))}
      />
      <dl className="mt-3 grid gap-1.5">
        {e.lines.map((l, i) => (
          <div key={l.id} className="flex items-center justify-between gap-3">
            <dt className="flex min-w-0 items-center gap-2 text-[13px] text-ink-2">
              <span className={cn("h-0.5 w-3 shrink-0 rounded-full", i === winner ? "bg-brand" : "bg-ink-3")} aria-hidden="true" />
              <span className="truncate">{e.names[i]}</span>
            </dt>
            <dd className={cn("figure text-[1.125rem] leading-none", i === winner ? "text-ink" : "text-ink-3")}>{lakh(values[i]!)}</dd>
          </div>
        ))}
      </dl>
      {!compact && (
        <>
          <p className="mt-3 text-[13px] leading-relaxed text-ink-2">{verdict(e.answer)}</p>
          <details className="group mt-2 text-sm">
            <summary className="w-fit cursor-pointer list-none text-[13px] font-semibold text-ink-2 hover:text-ink">The numbers, and how it was tested</summary>
            <table className="mt-3 w-full">
              <thead>
                <tr className="border-b border-rule text-left text-xs text-ink-3">
                  <th scope="col" className="pb-1.5 font-normal">
                    <span className="sr-only">Measure</span>
                  </th>
                  {e.names.map((n) => (
                    <th key={n} scope="col" className="pb-1.5 text-right font-medium">
                      {n}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {e.rows.map((r) => (
                  <tr key={r.label} className="border-b border-rule last:border-0">
                    <th scope="row" className="py-1.5 pr-3 text-left font-normal text-ink-2">
                      {r.label}
                    </th>
                    {r.values.map((v, i) => (
                      <td key={i} className={cn("num py-1.5 pl-3 text-right", r.better === i ? "font-semibold text-ink" : "text-ink-2")}>
                        {v}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
            <p className="mt-2 text-xs leading-relaxed text-ink-3">
              {e.period}. {e.assumptions} <PricesNote />
            </p>
          </details>
        </>
      )}
      <div className="mt-auto flex flex-wrap items-center justify-between gap-2 pt-3">
        <span title={verdict(e.answer)}>
          <Result>{resultOf(e)}</Result>
        </span>
        <Link href={e.labHref as Route} className="group inline-flex items-center gap-0.5 text-[13px] font-semibold text-brand">
          Change the rules
          <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
        </Link>
      </div>
    </article>
  )
}
