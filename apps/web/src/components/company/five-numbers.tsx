import type { CompanyProfile, Pillar } from "@greencircuits/market/research/company"
import { formatNumber } from "@greencircuits/market/format"
import { cn } from "@/lib/utils"

/**
 * The company in five numbers. Each column: the figure, a small picture that
 * puts it in context, and a verdict in words.
 */
export function FiveNumbers({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="grid gap-y-8 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0 lg:divide-x lg:divide-rule">
      {profile.pillars.map((p) => (
        <div key={p.id} className="flex flex-col lg:px-5 lg:first:pl-0 lg:last:pr-0">
          <p className="text-[13px] text-ink-2">{p.label}</p>
          <p className="mt-1 flex items-baseline gap-1.5">
            <span className="figure text-[1.875rem] leading-none">{p.figure}</span>
            <span className="text-[13px] text-ink-2">{p.unit}</span>
          </p>
          <div className="mt-4 mb-4 h-10">
            <PillarViz pillar={p} profile={profile} />
          </div>
          <p className="text-[0.9375rem] font-semibold">{p.verdict}</p>
          <p className="mt-1 text-[13px] leading-snug text-ink-3">{p.detail}</p>
        </div>
      ))}
    </div>
  )
}

function PillarViz({ pillar, profile }: { pillar: Pillar; profile: CompanyProfile }) {
  const { f, pe, sector } = profile
  switch (pillar.id) {
    case "valuation": {
      if (!pe) return null
      const pos = (v: number) => ((v - pe.min) / Math.max(1e-9, pe.max - pe.min)) * 100
      return (
        <div className="relative pt-3" aria-hidden="true">
          <div className="h-1 rounded-full bg-surface-2" />
          <div className="absolute top-2 h-3 w-px bg-ink-3" style={{ left: `${pos(pe.median)}%` }} />
          <div className="absolute top-[7px] size-3 -translate-x-1/2 rounded-full border-2 border-paper bg-ink" style={{ left: `${pos(pe.current)}%` }} />
          <div className="num mt-2 flex justify-between text-[11px] text-ink-3">
            <span>{formatNumber(pe.min, 0)}×</span>
            <span>median {formatNumber(pe.median, 0)}×</span>
            <span>{formatNumber(pe.max, 0)}×</span>
          </div>
        </div>
      )
    }
    case "growth": {
      const values = f.annual.map((a) => a.netProfit)
      const max = Math.max(...values)
      return (
        <div className="flex h-10 items-end gap-1" aria-hidden="true">
          {values.map((v, i) => (
            <div key={f.annual[i]!.label} className="flex flex-1 flex-col items-center justify-end gap-0.5">
              <div className={cn("w-full rounded-[1px]", i === values.length - 1 ? "bg-ink" : "bg-ink-3/40")} style={{ height: `${Math.max(4, (v / max) * 30)}px` }} />
              <span className="text-[9px] leading-none text-ink-3">{f.annual[i]!.label.slice(2)}</span>
            </div>
          ))}
        </div>
      )
    }
    case "profitability":
      return <PairBars a={f.roe} b={sector.roe} aLabel="This company" bLabel="Sector" format={(v) => `${formatNumber(v, 0)}%`} />
    case "balance":
      if (pillar.label === "Book value") {
        return <PairBars a={f.pb} b={sector.pb} aLabel="This company" bLabel="Sector" format={(v) => `${formatNumber(v, 1)}×`} />
      }
      return (
        <div className="pt-3" aria-hidden="true">
          <div className="relative h-1 rounded-full bg-surface-2">
            <div className="absolute inset-y-0 left-0 rounded-full bg-ink" style={{ width: `${Math.min(100, ((f.debtEquity ?? 0) / 2) * 100)}%` }} />
            <div className="absolute -top-1 h-3 w-px bg-ink-3" style={{ left: "50%" }} />
          </div>
          <div className="num mt-2 flex justify-between text-[11px] text-ink-3">
            <span>0</span>
            <span>1.0</span>
            <span>2.0</span>
          </div>
        </div>
      )
    case "ownership": {
      const s = f.shareholding.at(-1)!
      const parts = [
        { label: "Promoters", v: s.promoter, cls: "bg-ink" },
        { label: "Foreign", v: s.fpi, cls: "bg-accent-ink" },
        { label: "Domestic funds", v: s.dii, cls: "bg-ink-3" },
        { label: "Public", v: s.retail + s.government, cls: "bg-surface-2" },
      ]
      return (
        <div aria-hidden="true">
          <div className="mt-3 flex h-2 overflow-hidden rounded-full">
            {parts.map((p) => (
              <div key={p.label} className={p.cls} style={{ width: `${p.v}%` }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-x-2 text-[11px] text-ink-3">
            {parts.map((p) => (
              <span key={p.label} className="inline-flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", p.cls)} />
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )
    }
  }
}

function PairBars({ a, b, aLabel, bLabel, format }: { a: number; b: number; aLabel: string; bLabel: string; format: (v: number) => string }) {
  const max = Math.max(a, b) * 1.1 || 1
  return (
    <div className="space-y-1.5 pt-1" aria-hidden="true">
      {[
        { label: aLabel, v: a, cls: "bg-ink" },
        { label: bLabel, v: b, cls: "bg-ink-3/45" },
      ].map((r) => (
        <div key={r.label} className="grid grid-cols-[4.75rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-[11px] text-ink-3">
          <span>{r.label}</span>
          <span className="h-1.5 rounded-full bg-surface-2">
            <span className={cn("block h-full rounded-full", r.cls)} style={{ width: `${(r.v / max) * 100}%` }} />
          </span>
          <span className="num text-right">{format(r.v)}</span>
        </div>
      ))}
    </div>
  )
}
