import Link from "next/link"
import { formatNumber } from "@greencircuits/market/format"
import { Meter } from "@/components/parts/meter"
import { Monogram } from "@/components/parts/monogram"
import { Move } from "@/components/parts/move"
import { Tag } from "@/components/parts/tag"
import type { Leader } from "./returns"

const SPANS = [
  { key: "y1", label: "1 year", wide: false },
  { key: "y3", label: "3 years, a year", wide: false },
  { key: "y5", label: "5 years, a year", wide: true },
] as const

/**
 * The best fund in each of the main categories, with its returns as bars and
 * how far it is ahead of the typical fund there.
 */
export function Leaders({ leaders }: { leaders: Leader[] }) {
  const widest = Math.max(1, ...leaders.flatMap((l) => SPANS.map((s) => l.scheme[s.key] ?? 0)))
  return (
    <div className="scrollbar-thin overflow-x-auto">
      <table className="w-full min-w-[36rem] text-sm">
        <thead>
          <tr className="border-b border-rule text-left text-xs text-ink-3">
            <th scope="col" className="pb-2 font-medium">
              Fund, direct plan
            </th>
            {SPANS.map((s) => (
              <th key={s.key} scope="col" className={s.wide ? "pb-2 font-medium" : "hidden pb-2 font-medium md:table-cell"}>
                {s.label}
              </th>
            ))}
            <th scope="col" className="pb-2 text-right font-medium">
              Over the typical fund
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-rule">
          {leaders.map((l) => {
            const ahead = l.typical != null && l.scheme[l.key] != null ? l.scheme[l.key]! - l.typical : null
            return (
              <tr key={l.category}>
                <td className="py-2.5 pr-4">
                  <Link href={`/funds/${l.scheme.code}`} className="group flex min-w-0 items-center gap-2.5">
                    <Monogram text={l.scheme.amc} size={28} />
                    <span className="min-w-0">
                      <span className="block max-w-72 truncate font-semibold decoration-rule-strong group-hover:underline group-hover:underline-offset-4">{l.scheme.name}</span>
                      <span className="mt-0.5 flex">
                        <Tag>{l.category}</Tag>
                      </span>
                    </span>
                  </Link>
                </td>
                {SPANS.map((s) => {
                  const v = l.scheme[s.key]
                  return (
                    <td key={s.key} className={s.wide ? "py-2.5 pr-4" : "hidden py-2.5 pr-4 md:table-cell"}>
                      <span className="grid grid-cols-[minmax(3rem,1fr)_3.25rem] items-center gap-2">
                        <Meter value={Math.max(0, v ?? 0) / widest} height={5} barClassName={s.key === l.key ? "bg-ink" : "bg-ink-3/50"} />
                        <span className="num text-right text-[13px] font-semibold">{v == null ? "–" : `${formatNumber(v, 1)}%`}</span>
                      </span>
                    </td>
                  )
                })}
                <td className="py-2.5 text-right">
                  <span className="inline-flex flex-col items-end gap-0.5">
                    <Move value={ahead} digits={1} unit="pts" />
                    <span className="text-[11px] text-ink-3">{l.key === "y5" ? "5 years" : "3 years"}</span>
                  </span>
                </td>
              </tr>
            )
          })}
        </tbody>
      </table>
    </div>
  )
}
