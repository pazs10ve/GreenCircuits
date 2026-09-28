import type { CompanyProfile, Pillar, Tone } from "@greencircuits/market/research/company"
import { formatNumber } from "@greencircuits/market/format"
import { RangeMarker } from "@/components/parts/range-marker"
import { RAMP, ShareBar } from "@/components/parts/share-bar"
import { Tag, type TagTone } from "@/components/parts/tag"
import { cn } from "@/lib/utils"

const VERDICT: Record<Tone, TagTone> = { good: "up", neutral: "neutral", caution: "down" }

/**
 * The company's scorecard: five measures, each a figure, a small picture that
 * puts it in context, and a verdict as a tag in the scorecard's colours. The
 * reasoning behind each verdict is in its tooltip.
 */
export function FiveNumbers({ profile }: { profile: CompanyProfile }) {
  return (
    <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-5 lg:gap-0 lg:divide-x lg:divide-rule">
      {profile.pillars.map((p) => (
        <div key={p.id} className="flex min-w-0 flex-col gap-3 lg:px-5 lg:first:pl-0 lg:last:pr-0">
          <p className="text-[13px] text-ink-2">{p.label}</p>
          <p className="flex items-baseline gap-1.5">
            <span className="figure text-[1.875rem] leading-none">{p.figure}</span>
            <span className="text-xs text-ink-3">{p.unit}</span>
          </p>
          <div className="min-h-16">
            <PillarViz pillar={p} profile={profile} />
          </div>
          <div className="mt-auto" title={p.detail}>
            <Tag tone={VERDICT[p.tone]}>
              <span className="size-1.5 shrink-0 rounded-full bg-current" aria-hidden="true" />
              {p.verdict}
            </Tag>
          </div>
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
      const pos = (v: number) => (v - pe.min) / Math.max(1e-9, pe.max - pe.min)
      return (
        <RangeMarker
          className="pt-2"
          value={pos(pe.current)}
          mark={pos(pe.median)}
          left={`${formatNumber(pe.min, 0)}×`}
          caption={`median ${formatNumber(pe.median, 0)}×`}
          right={`${formatNumber(pe.max, 0)}×`}
          label={`P/E ${formatNumber(pe.current, 1)} against ${formatNumber(pe.min, 0)} to ${formatNumber(pe.max, 0)} over ${pe.years} years`}
        />
      )
    }
    case "growth": {
      const values = f.annual.map((a) => a.netProfit)
      const max = Math.max(...values.map(Math.abs), 1e-9)
      return (
        <div className="flex h-16 items-end gap-1.5" aria-hidden="true">
          {values.map((v, i) => (
            <div key={f.annual[i]!.label} className="flex h-full flex-1 flex-col items-center justify-end gap-1">
              <div
                className={cn("w-full rounded-[3px]", v < 0 ? "bg-down/70" : i === values.length - 1 ? "bg-ink" : "bg-rule-strong")}
                style={{ height: `${Math.max(6, (Math.abs(v) / max) * 44)}px` }}
              />
              <span className="text-[10px] leading-none text-ink-3">{f.annual[i]!.label.slice(2)}</span>
            </div>
          ))}
        </div>
      )
    }
    case "profitability":
      return <PairBars a={f.roe} b={sector.roe} format={(v) => `${formatNumber(v, 0)}%`} />
    case "balance": {
      if (pillar.label === "Book value") return <PairBars a={f.pb} b={sector.pb} format={(v) => `${formatNumber(v, 1)}×`} />
      const de = f.debtEquity ?? 0
      return (
        <RangeMarker
          className="pt-2"
          value={Math.min(1, de / 2)}
          left="None"
          right="2× equity"
          label={`Debt at ${formatNumber(de, 2)} times equity`}
          zones={[
            { from: 0, to: 0.15, className: "bg-up-soft" },
            { from: 0.5, to: 1, className: "bg-down-soft" },
          ]}
        />
      )
    }
    case "ownership": {
      const s = f.shareholding.at(-1)!
      // Without the full split, NSE's "public" includes the funds and foreign investors.
      const split = f.shareholding.some((x) => x.fpi > 0 || x.dii > 0)
      const parts = split
        ? [
            { label: "Promoters", value: s.promoter },
            { label: "Foreign", value: s.fpi },
            { label: "Funds", value: s.dii },
            { label: "Public", value: s.retail + s.government },
          ]
        : [
            { label: "Promoters", value: s.promoter },
            { label: "Public, funds and foreign", value: s.retail + s.government },
          ]
      const shade = (i: number) => (i === parts.length - 1 ? RAMP[4]! : RAMP[i]!)
      return (
        <div className="pt-2">
          <ShareBar parts={parts.map((p, i) => ({ value: p.value, className: shade(i) }))} label={parts.map((p) => `${p.label} ${formatNumber(p.value, 1)}%`).join(", ")} />
          <div className="mt-2 flex flex-wrap gap-x-2.5 gap-y-1 text-[11px] text-ink-3" aria-hidden="true">
            {parts.slice(0, 3).map((p, i) => (
              <span key={p.label} className="inline-flex items-center gap-1">
                <span className={cn("size-1.5 rounded-full", shade(i))} />
                {p.label}
              </span>
            ))}
          </div>
        </div>
      )
    }
  }
}

function PairBars({ a, b, format }: { a: number; b: number; format: (v: number) => string }) {
  const max = Math.max(a, b) * 1.1 || 1
  return (
    <div className="space-y-2 pt-1" aria-hidden="true">
      {[
        { label: "This company", v: a, cls: "bg-ink", text: "text-ink font-semibold" },
        { label: "Its sector", v: b, cls: "bg-rule-strong", text: "text-ink-3" },
      ].map((r) => (
        <div key={r.label} className="grid grid-cols-[4.75rem_minmax(0,1fr)_2.5rem] items-center gap-2 text-[11px] text-ink-3">
          <span>{r.label}</span>
          <span className="h-1.5 rounded-full bg-surface-2">
            <span className={cn("block h-full rounded-full", r.cls)} style={{ width: `${Math.max(0, (r.v / max) * 100)}%` }} />
          </span>
          <span className={cn("num text-right", r.text)}>{format(r.v)}</span>
        </div>
      ))}
    </div>
  )
}
