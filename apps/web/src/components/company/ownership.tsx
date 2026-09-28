import type { Shareholding } from "@greencircuits/market/fundamentals"
import { formatNumber } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"
import { Move } from "@/components/parts/move"

type Part = { key: "promoter" | "fpi" | "dii" | "public"; label: string; cls: string }

const PARTS: Part[] = [
  { key: "promoter", label: "Promoters", cls: "bg-ink" },
  { key: "fpi", label: "Foreign investors", cls: "bg-ink-2" },
  { key: "dii", label: "Mutual funds and insurers", cls: "bg-ink-3" },
  { key: "public", label: "Public and others", cls: "bg-rule-strong" },
]

/** NSE's summary pattern splits holdings only into promoters and the public, which includes funds and foreign investors. */
const SUMMARY: Part[] = [
  { key: "promoter", label: "Promoters", cls: "bg-ink" },
  { key: "public", label: "Public, including funds and foreign investors", cls: "bg-rule-strong" },
]

function part(s: Shareholding, key: Part["key"]): number {
  return key === "public" ? s.retail + s.government : s[key]
}

/**
 * Who owns the company, quarter by quarter, and how that changed over the
 * year. With the full split, each quarter is a stacked bar; with only NSE's
 * promoter-and-public summary, the promoters' stake gets the chart to itself,
 * so that a change of a point or two can be seen at all.
 */
export function Ownership({ history, name }: { history: Shareholding[]; name: string }) {
  const now = history.at(-1)!
  const yearAgo = history.at(-5) ?? history[0]!
  const split = history.some((s) => s.fpi > 0 || s.dii > 0)
  const parts = split ? PARTS : SUMMARY
  return (
    <div className="grid gap-10 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)] md:gap-14">
      {split ? (
        <figure>
          <div className="flex h-44 items-stretch gap-2" role="img" aria-label={`Shareholding of ${name} over the last ${history.length} quarters`}>
            {history.map((s) => (
              <div key={s.label} className="flex flex-1 flex-col">
                <div className="flex flex-1 flex-col-reverse overflow-hidden rounded-[2px]">
                  {parts.map((p) => (
                    <div key={p.key} className={cn("border-t border-paper first:border-t-0", p.cls)} style={{ height: `${part(s, p.key)}%` }} />
                  ))}
                </div>
              </div>
            ))}
          </div>
          <Quarters history={history} />
        </figure>
      ) : now.promoter > 0 ? (
        <PromoterStake history={history} name={name} />
      ) : (
        <p className="max-w-[34em] self-center font-serif text-[1.1875rem] leading-relaxed text-ink-2">
          {name} has no promoter group: all of it is held by mutual funds, insurers, foreign investors and the public.
        </p>
      )}
      <table className="w-full self-start text-sm">
        <thead>
          <tr className="border-b border-rule text-xs text-ink-3">
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
                <td className="py-2.5 text-right">
                  {Math.abs(d) < 0.05 ? <span className="text-ink-3">–</span> : <Move value={d} digits={1} unit="pts" />}
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}

function Quarters({ history }: { history: Shareholding[] }) {
  return (
    <div className="mt-2 flex gap-2 text-[11px] text-ink-3">
      {history.map((s) => (
        <span key={s.label} className="flex-1 text-center">
          {s.label.replace(" FY", "·")}
        </span>
      ))}
    </div>
  )
}

/** The promoters' stake each quarter, on a scale from zero, with the figure on every column. */
function PromoterStake({ history, name }: { history: Shareholding[]; name: string }) {
  const max = Math.max(...history.map((s) => s.promoter)) * 1.18
  return (
    <figure>
      <figcaption className="mb-3 text-[13px] text-ink-2">Held by the promoters, % of shares</figcaption>
      <div
        className="flex h-40 items-end gap-2 border-b border-rule-strong"
        role="img"
        aria-label={`The promoters of ${name} held ${formatNumber(history[0]!.promoter, 1)}% ${history.length} quarters ago and ${formatNumber(history.at(-1)!.promoter, 1)}% now`}
      >
        {history.map((s, i) => {
          const last = i === history.length - 1
          return (
            <div key={s.label} className="flex h-full flex-1 flex-col justify-end">
              <span className={cn("num mb-1 text-center text-[11px]", last ? "font-semibold text-ink" : "text-ink-3")}>{formatNumber(s.promoter, 1)}</span>
              <div className={cn("rounded-t-[3px]", last ? "bg-ink" : "bg-rule-strong")} style={{ height: `${(s.promoter / max) * 100}%` }} />
            </div>
          )
        })}
      </div>
      <Quarters history={history} />
    </figure>
  )
}
