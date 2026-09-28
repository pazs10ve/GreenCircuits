import type { Metadata } from "next"
import { connection } from "next/server"
import { ArrowDownUp, BadgeCheck, Timer } from "lucide-react"
import { BondCalculator } from "@/components/bonds/bond-calculator"
import type { BondRow } from "@/components/bonds/bond-math"
import { BondScreener } from "@/components/bonds/bond-screener"
import { spreadOver } from "@/components/bonds/curve"
import { GoldBonds } from "@/components/bonds/gold-bonds"
import { KeyYields } from "@/components/bonds/key-yields"
import { Spreads } from "@/components/bonds/spreads"
import { YieldCurveChart } from "@/components/bonds/yield-curve"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { getBondsData } from "@/lib/data/bonds"

export const metadata: Metadata = {
  title: "Bonds",
  description: "The government yield curve, government, state and company bonds, gold bonds, and a calculator for price, yield and duration.",
}

const longDate = (date: string) => new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "long", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`))

const READING = [
  { icon: ArrowDownUp, title: "Price and yield move apart", text: "A bond's interest is fixed, so when new bonds pay more, old ones get cheaper: prices fall as yields rise." },
  { icon: BadgeCheck, title: "Ratings price the risk", text: "The government's yield is the floor. States pay a little more, and companies more again, the lower their rating." },
  { icon: Timer, title: "Duration measures the swing", text: "A duration of seven means about 7% off the price for each point yields rise. The longer the bond, the bigger the swing." },
]

export default async function BondsPage() {
  // Yields and years to maturity are worked out for the day of the request.
  await connection()
  const now = new Date()
  const { bonds, curve, real, asOf } = await getBondsData(now)
  const ten = curve.find((p) => p.tenor === 10) ?? curve.at(-1)!
  // How steep the curve is: ten years over one, or its long end over its short where it doesn't reach a year.
  const [short, long] = curve.some((p) => p.tenor === 1) && ten.tenor === 10 ? [curve.find((p) => p.tenor === 1)!, ten] : [curve[0]!, curve.at(-1)!]
  const years = (t: number) => (t < 1 ? `${Math.round(t * 12)} months` : `${t} year${t === 1 ? "" : "s"}`)
  const spreadOf = (rows: BondRow[]) => spreadOver(curve, rows)
  const corporate = bonds.filter((b) => b.type === "Corporate")
  const spreads = [
    { label: "States", bp: spreadOf(bonds.filter((b) => b.type === "SDL")) },
    { label: "Public sector", bp: spreadOf(bonds.filter((b) => b.type === "PSU")) },
    { label: "AAA companies", bp: spreadOf(corporate.filter((b) => b.rating === "AAA")) },
    { label: "AA companies", bp: spreadOf(corporate.filter((b) => /^AA[+-]?$/.test(b.rating))) },
    { label: "A and below", bp: spreadOf(corporate.filter((b) => /^(A[+-]?|BBB[+-]?|BB[+-]?|B|C|D)$/.test(b.rating))) },
  ].flatMap((r) => (r.bp == null ? [] : [{ label: r.label, bp: r.bp }]))
  const history = curve.some((p) => p.monthAgo != null)
  const lede = ["Yields in % a year", history ? "changes against a month ago" : null, real ? `NSE trades on ${longDate(asOf!)}` : "sample data"].filter(Boolean).join(" · ")
  const gold = bonds.filter((b) => b.type === "SGB")

  return (
    <div className="page pt-6 pb-10">
      <PageHead title="Bonds" lede={lede} />
      <KeyYields points={curve} className="mt-5" />

      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Section
          className="lg:col-span-8"
          title="The government's yield curve"
          description={
            real
              ? `What it pays to borrow for ${curve[0]!.tenor} to ${curve.at(-1)!.tenor} years, fitted to today's trades in its bonds${ten.monthAgo != null ? ", beside the curve a month and a year ago" : ""}. Move along the curve to read it.`
              : "What it pays to borrow for three months to forty years: today, a month ago and a year ago. Move along the curve to read it."
          }
        >
          <YieldCurveChart points={curve} />
        </Section>
        <Section
          className="lg:col-span-4"
          title="Extra yield over the government"
          description="What each kind of borrower pays over the government's curve at the same term, on average over its bonds with a yield today. A basis point (bp) is a hundredth of a percentage point."
        >
          <Spreads rows={spreads} slope={long.tenor > short.tenor ? { label: `${years(long.tenor)} over ${years(short.tenor)}`, bp: (long.today - short.today) * 100 } : null} />
        </Section>

        <Section
          className="lg:col-span-12"
          title="Bonds"
          description={
            real
              ? "Government, state and company bonds and Treasury bills listed on the NSE. Many trade only now and then, so a yield is shown only for a bond that traded today."
              : "Sample data: real issuer names with made-up terms, each priced at today's yield for its term and rating."
          }
        >
          <BondScreener bonds={bonds.filter((b) => b.type !== "SGB")} real={real} />
        </Section>

        {gold.length > 0 && (
          <Section
            className="lg:col-span-12"
            title="Sovereign gold bonds"
            description="The government pays 2.5% a year on what a bond cost at issue, and repays the price of a gram of gold when it matures. Held to maturity, the gain is tax-free."
          >
            <GoldBonds bonds={gold} real={real} />
          </Section>
        )}

        <Section id="calculator" className="lg:col-span-12" title="Price a bond" description="Work out a price from a yield, or a yield from a price, and how much it moves when rates do.">
          <BondCalculator />
        </Section>

        <Section className="lg:col-span-12" title="Reading bonds">
          <div className="grid gap-3 md:grid-cols-3">
            {READING.map((r) => (
              <div key={r.title} className="rounded-panel bg-panel p-4">
                <p className="flex items-center gap-2 text-sm font-semibold">
                  <r.icon className="size-4 text-ink-3" aria-hidden="true" />
                  {r.title}
                </p>
                <p className="mt-1.5 text-[13px] leading-relaxed text-ink-2">{r.text}</p>
              </div>
            ))}
          </div>
        </Section>
      </div>
    </div>
  )
}
