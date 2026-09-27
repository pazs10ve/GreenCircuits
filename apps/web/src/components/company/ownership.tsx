import type { Shareholding } from "@greencircuits/market/fundamentals"
import { formatNumber } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

type Part = { key: "promoter" | "fpi" | "dii" | "public"; label: string; cls: string }

const PARTS: Part[] = [
  { key: "promoter", label: "Promoters", cls: "bg-ink" },
  { key: "fpi", label: "Foreign investors", cls: "bg-accent-ink" },
  { key: "dii", label: "Mutual funds and insurers", cls: "bg-ink-3" },
  { key: "public", label: "Public and others", cls: "bg-surface-2" },
]

/** NSE's summary pattern splits holdings only into promoters and the public, which includes funds and foreign investors. */
const SUMMARY: Part[] = [
  { key: "promoter", label: "Promoters", cls: "bg-ink" },
  { key: "public", label: "Public, including funds and foreign investors", cls: "bg-surface-2" },
]

function part(s: Shareholding, key: Part["key"]): number {
  return key === "public" ? s.retail + s.government : s[key]
}

/** Who owns the company, quarter by quarter, and how that changed over the year. */
export function Ownership({ history, name }: { history: Shareholding[]; name: string }) {
  const now = history.at(-1)!
  const yearAgo = history.at(-5) ?? history[0]!
  const parts = history.some((s) => s.fpi > 0 || s.dii > 0) ? PARTS : SUMMARY
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-14">
      <figure>
        <div className="flex h-44 items-stretch gap-2" role="img" aria-label={`Shareholding of ${name} over the last ${history.length} quarters`}>
          {history.map((s) => (
            <div key={s.label} className="flex flex-1 flex-col">
              <div className="flex flex-1 flex-col-reverse overflow-hidden rounded-[2px]">
                {parts.map((p) => (
                  <div key={p.key} className={p.cls} style={{ height: `${part(s, p.key)}%` }} />
                ))}
              </div>
            </div>
          ))}
        </div>
        <div className="mt-2 flex gap-2 text-[11px] text-ink-3">
          {history.map((s) => (
            <span key={s.label} className="flex-1 text-center">
              {s.label.replace(" FY", "·")}
            </span>
          ))}
        </div>
      </figure>
      <table className="w-full self-start text-sm">
        <thead>
          <tr className="border-b border-ink text-xs text-ink-3">
            <th scope="col" className="pb-2 text-left font-normal">
              {now.label}
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              Share
            </th>
            <th scope="col" className="pb-2 text-right font-normal">
              In a year
            </th>
          </tr>
        </thead>
        <tbody>
          {parts.map((p) => {
            const v = part(now, p.key)
            const d = v - part(yearAgo, p.key)
            return (
              <tr key={p.key} className="border-b border-rule">
                <th scope="row" className="py-2.5 text-left font-normal">
                  <span className="inline-flex items-center gap-2">
                    <span className={cn("size-2.5 rounded-[2px]", p.cls)} />
                    {p.label}
                  </span>
                </th>
                <td className="num py-2.5 text-right">{formatNumber(v, 1)}%</td>
                <td className="num py-2.5 text-right text-ink-2">
                  {Math.abs(d) < 0.05 ? "–" : `${d > 0 ? "+" : "−"}${formatNumber(Math.abs(d), 1)} pts`}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
