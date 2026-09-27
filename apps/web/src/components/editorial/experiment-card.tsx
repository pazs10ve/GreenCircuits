import Link from "next/link"
import type { Experiment } from "@greencircuits/market/research/experiments"
import { MiniLines } from "@/components/viz/mini-lines"
import { cn } from "@/lib/utils"

const TONE = { ink: "var(--ink)", accent: "var(--accent-ink)" } as const

function lakh(v: number): string {
  return v >= 1e7 ? `₹${(v / 1e7).toFixed(2)} Cr` : `₹${(v / 1e5).toFixed(1)} L`
}

/** One "would it have worked?" result: the question, the answer, the evidence. */
export function ExperimentCard({ experiment: e, className }: { experiment: Experiment; className?: string }) {
  return (
    <article className={cn("flex flex-col", className)}>
      <h3 className="font-serif text-[1.25rem] leading-snug font-semibold tracking-[-0.005em]">{e.question}</h3>
      <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{e.answer}</p>
      <MiniLines
        className="mt-5"
        height={132}
        ariaLabel={`${e.names[0]} against ${e.names[1]}, ${e.period}`}
        format={lakh}
        lines={e.lines.map((l) => ({ id: l.id, label: l.label, points: l.points, color: TONE[l.tone] }))}
      />
      <p className="mt-1.5 text-xs text-ink-3">{e.period}</p>
      <table className="mt-4 w-full text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs text-ink-3">
            <th scope="col" className="pb-1.5 font-normal">
              <span className="sr-only">Measure</span>
            </th>
            {e.names.map((n, i) => (
              <th key={n} scope="col" className="pb-1.5 text-right font-medium" style={{ color: TONE[e.lines[i]!.tone] }}>
                {n}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {e.rows.map((r) => (
            <tr key={r.label} className="border-b border-rule last:border-0">
              <th scope="row" className="py-2 pr-3 text-left font-normal text-ink-2">
                {r.label}
              </th>
              {r.values.map((v, i) => (
                <td key={i} className={cn("num py-2 pl-3 text-right", r.better === i ? "font-semibold text-ink" : "text-ink-2")}>
                  {v}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
      <details className="group mt-3 text-xs text-ink-3">
        <summary className="cursor-pointer list-none hover:text-ink-2">
          <span className="underline decoration-dotted underline-offset-2">How this was tested</span>
        </summary>
        <p className="mt-2 leading-relaxed">{e.assumptions} Prices are from the demo market, not real history.</p>
      </details>
      <Link href={e.labHref} className="link mt-4 inline-flex w-fit items-center gap-1 text-sm font-medium">
        Change the rules and run it yourself <span aria-hidden="true">→</span>
      </Link>
    </article>
  )
}
