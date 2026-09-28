import { formatNumber } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

/** The bars' height, and the room kept over and under them for their numbers. */
const H = 210
const ROOM = 16

type Group = { label: string; own: number | null; typical: number | null; index: number | null }

/**
 * A fund's returns beside the typical fund's and its index's, a set of bars
 * for each span: the fund in ink, the typical fund in grey, the index in the
 * benchmark's blue.
 */
export function ReturnBars({ groups, indexName }: { groups: Group[]; indexName: string | null }) {
  const series: { key: "own" | "typical" | "index"; label: string; className: string }[] = [
    { key: "own", label: "This fund", className: "bg-ink" },
    { key: "typical", label: "Typical fund", className: "bg-ink-3/40" },
    ...(indexName ? [{ key: "index" as const, label: indexName, className: "bg-bench" }] : []),
  ]
  const values = groups.flatMap((g) => series.map((s) => g[s.key])).filter((v): v is number => v != null)
  const top = Math.max(0, ...values)
  const span = top + Math.max(0, ...values.map((v) => -v)) || 1
  const zero = ROOM + (top / span) * H
  const size = (v: number) => (Math.abs(v) / span) * H

  return (
    <figure>
      <figcaption className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-ink-2">
        {series.map((s) => (
          <span key={s.key} className="inline-flex items-center gap-1.5">
            <span className={cn("size-2 rounded-[2px]", s.className)} aria-hidden="true" />
            {s.label}
          </span>
        ))}
      </figcaption>
      <div className="mt-3 grid" aria-hidden="true" style={{ gridTemplateColumns: `repeat(${groups.length}, minmax(0, 1fr))` }}>
        {groups.map((g) => (
          <div key={g.label} className="min-w-0">
            <div className="relative flex justify-center gap-[3px]" style={{ height: H + 2 * ROOM }}>
              <span className="absolute inset-x-0 h-px bg-rule-strong" style={{ top: zero }} aria-hidden="true" />
              {series.map((s) => {
                const v = g[s.key]
                return (
                  <div key={s.key} className="relative w-full max-w-[26px]">
                    {v == null ? (
                      <span className="absolute inset-x-0 -translate-y-full text-center text-[10px] leading-none text-ink-3" style={{ top: zero - 3 }}>
                        –
                      </span>
                    ) : (
                      <>
                        <span className={cn("absolute inset-x-0", v >= 0 ? "rounded-t-[3px]" : "rounded-b-[3px]", s.className)} style={v >= 0 ? { top: zero - size(v), height: size(v) } : { top: zero, height: size(v) }} />
                        <span
                          className={cn("num absolute left-1/2 -translate-x-1/2 text-[10px] leading-none font-semibold whitespace-nowrap", s.key === "own" ? "text-ink" : "text-ink-3")}
                          style={v >= 0 ? { top: zero - size(v) - 13 } : { top: zero + size(v) + 3 }}
                        >
                          {formatNumber(v, 1)}
                        </span>
                      </>
                    )}
                  </div>
                )
              })}
            </div>
            <p className="mt-1 text-center text-xs text-ink-3">{g.label}</p>
          </div>
        ))}
      </div>
      <table className="sr-only">
        <caption>Returns, per cent a year</caption>
        <thead>
          <tr>
            <th scope="col">Span</th>
            {series.map((s) => (
              <th key={s.key} scope="col">
                {s.label}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {groups.map((g) => (
            <tr key={g.label}>
              <th scope="row">{g.label}</th>
              {series.map((s) => (
                <td key={s.key}>{g[s.key] == null ? "–" : `${formatNumber(g[s.key]!, 1)}%`}</td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  )
}
