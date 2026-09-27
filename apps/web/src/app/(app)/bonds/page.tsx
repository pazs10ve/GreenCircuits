import type { Metadata } from "next"
import { connection } from "next/server"
import { formatNumber } from "@greencircuits/market/format"
import { getBonds, gsecYield, yieldCurve } from "@greencircuits/market/reference"
import { BondCalculator } from "@/components/bonds/bond-calculator"
import type { BondRow } from "@/components/bonds/bond-math"
import { BondScreener } from "@/components/bonds/bond-screener"
import { YieldCurveChart } from "@/components/bonds/yield-curve"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { SectionNav } from "@/components/shell/section-nav"

export const metadata: Metadata = {
  title: "Bonds",
  description: "The government yield curve, government, state and company bonds, and a calculator for price, yield and duration.",
}

const YEAR = 365.25 * 86_400_000

/** "0.06 points less than a month ago", or "unchanged from a month ago". */
function against(now: number, then: number, when: string): string {
  const d = now - then
  if (Math.abs(d) < 0.005) return `unchanged from ${when}`
  return `${formatNumber(Math.abs(d), 2)} points ${d > 0 ? "more" : "less"} than ${when}`
}

export default async function BondsPage() {
  // Yields and years to maturity are worked out for the day of the request.
  await connection()
  const now = new Date()
  const bonds: BondRow[] = getBonds(now).map((b) => ({ ...b, yearsLeft: Math.max(0, (b.maturity.getTime() - now.getTime()) / YEAR) }))
  const curve = yieldCurve()
  const ten = curve.find((p) => p.tenor === 10) ?? curve.at(-1)!
  const spreadOf = (rows: BondRow[]) => rows.reduce((s, b) => s + (b.ytm - gsecYield(b.yearsLeft)), 0) / Math.max(1, rows.length)
  const aaa = spreadOf(bonds.filter((b) => b.rating === "AAA"))
  const states = spreadOf(bonds.filter((b) => b.type === "SDL"))

  const lede =
    `The government pays ${formatNumber(ten.today, 2)}% a year to borrow for ten years, ${against(ten.today, ten.monthAgo, "a month ago")} and ` +
    `${against(ten.today, ten.yearAgo, "a year ago")}. States pay about ${formatNumber(states, 2)} points more, and top-rated companies about ${formatNumber(aaa, 2)} points more.`

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-6 pb-20">
      <SectionNav section="explore" />
      <PageHead title="Bonds" serif lede={lede} />
      <p className="mt-3 text-sm text-ink-3">Sample data: real issuer names with made-up terms, priced off a model yield curve.</p>

      <div className="mt-14 space-y-16">
        <Section
          title="The government's yield curve"
          description="What it pays to borrow for three months to forty years: today, a month ago and a year ago. Move along the curve to read it."
        >
          <YieldCurveChart points={curve} />
        </Section>

        <Section title="Bonds" description="Government, state, public-sector and company bonds, each priced at today's yield for its term and rating.">
          <BondScreener bonds={bonds} />
        </Section>

        <Section id="calculator" title="Price a bond" description="Work out a price from a yield, or a yield from a price, and how much it moves when rates do.">
          <BondCalculator />
        </Section>

        <Section title="Reading bonds">
          <div className="grid max-w-5xl gap-x-12 gap-y-6 text-[0.9375rem] leading-relaxed text-ink-2 md:grid-cols-3">
            <p>
              <span className="font-semibold text-ink">Price and yield move apart.</span> A bond&apos;s interest is fixed when it&apos;s issued. When new bonds pay more, old
              ones have to get cheaper to keep up, so prices fall as yields rise.
            </p>
            <p>
              <span className="font-semibold text-ink">Ratings price the risk.</span> The government can always pay in rupees, so its yield is the floor. States pay a
              little more, and companies more again, the lower their rating.
            </p>
            <p>
              <span className="font-semibold text-ink">Duration measures the swing.</span> A bond with a duration of seven moves about 7% in price for each point yields
              move. The longer the bond, the bigger the swing.
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}
