import { formatNumber } from "@greencircuits/market/format"
import { Figure } from "@/components/editorial/figures"
import { cn } from "@/lib/utils"
import type { FlowDay } from "./market-rows"

const dayText = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))

function Amount({ label, value, dot }: { label: string; value: number; dot: string }) {
  return (
    <Figure
      variant="panel"
      size="sm"
      label={
        <span className="inline-flex items-center gap-1.5">
          <span className={cn("size-2 rounded-full", dot)} aria-hidden="true" />
          {label}
        </span>
      }
      value={`${value >= 0 ? "+" : "−"}₹${formatNumber(Math.abs(value), 0)} Cr`}
      tone={value >= 0 ? "up" : "down"}
      hint={value >= 0 ? "Bought more than sold" : "Sold more than bought"}
    />
  )
}

/**
 * Foreign portfolio investors against Indian institutions (mutual funds,
 * insurers, banks): what each bought less what it sold in the cash market,
 * from NSE's daily figures. A day at a time, with the days before when the
 * loader has collected them.
 */
export function Flows({ days }: { days: FlowDay[] }) {
  const last = days.at(-1)
  if (!last) return <p className="text-sm text-ink-2">NSE hasn&apos;t published the day&apos;s figures yet.</p>
  const recent = days.slice(-20)
  const max = Math.max(...recent.flatMap((d) => [Math.abs(d.fpiCash), Math.abs(d.diiCash)]), 1)
  return (
    <div>
      <p className="text-xs text-ink-3">{dayText(last.date)}, net in the cash market</p>
      <dl className="mt-2 grid grid-cols-2 gap-2">
        <Amount label="Foreign investors" value={last.fpiCash} dot="bg-bench" />
        <Amount label="Indian institutions" value={last.diiCash} dot="bg-ink-3" />
      </dl>
      {recent.length >= 3 && (
        <div className="mt-5">
          {/* Each day, a pair of bars from the zero line: up for buying, down for selling. */}
          <div className="relative flex h-28 items-stretch gap-1.5" role="img" aria-label={`Net flows over the last ${recent.length} days`}>
            <span className="absolute inset-x-0 top-1/2 h-px bg-rule-strong" aria-hidden="true" />
            {recent.map((d) => (
              <div key={d.date} className="flex flex-1 gap-px" title={`${dayText(d.date)}: foreign ${formatNumber(d.fpiCash, 0)}, Indian ${formatNumber(d.diiCash, 0)} crore`}>
                {([
                  ["fpi", d.fpiCash, "bg-bench"],
                  ["dii", d.diiCash, "bg-ink-3"],
                ] as const).map(([key, v, color]) => (
                  <div key={key} className="flex flex-1 flex-col">
                    <div className="flex flex-1 items-end">{v > 0 && <span className={cn("block w-full rounded-t-[1px]", color)} style={{ height: `${(v / max) * 100}%` }} />}</div>
                    <div className="flex flex-1 items-start">{v < 0 && <span className={cn("block w-full rounded-b-[1px]", color)} style={{ height: `${(-v / max) * 100}%` }} />}</div>
                  </div>
                ))}
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-ink-3">{recent.length} days: above the line bought, below sold</p>
        </div>
      )}
    </div>
  )
}
