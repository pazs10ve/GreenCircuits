import type { Metadata } from "next"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { Breadth } from "@/components/markets/breadth"
import { Flows } from "@/components/markets/flows"
import { Heatmap } from "@/components/markets/heatmap"
import { IndexCards } from "@/components/markets/index-cards"
import type { FlowDay, MarketRow } from "@/components/markets/market-rows"
import { Movers } from "@/components/markets/movers"
import { SectorReturns } from "@/components/markets/sector-returns"
import { VixChart } from "@/components/markets/vix-chart"
import { directoryStocks } from "@/components/stocks/data"
import { EQUITIES, INDEX, getInstrument, marketCapCr, membersOf } from "@greencircuits/market/catalog"
import { screenerSnapshot, type ScreenRow } from "@greencircuits/market/fundamentals"
import { dailyCandles } from "@greencircuits/market/history"
import { liveGet } from "@/lib/data/market"
import { getUniverse } from "@/lib/data/universe"

export const metadata: Metadata = {
  title: "Markets",
  description: "The Indian market at a glance: every Nifty 500 company on one map, how broad the day's move is, sectors over time, movers, India VIX and institutional money.",
}

/** The tiles along the top: the main indices, large to small, then fear. */
const CARDS: { id: number; note?: string }[] = [
  { id: INDEX.NIFTY },
  { id: INDEX.SENSEX },
  { id: INDEX.BANKNIFTY },
  { id: INDEX.MIDCAP150 },
  { id: INDEX.SMALLCAP250 },
  { id: INDEX.VIX },
]

/**
 * The market as a whole, where Today is the day's story: a map of every
 * company, how broad the move is, sectors over four periods, the movers, fear
 * and where institutional money went.
 */
export default async function MarketsPage() {
  const [universe, screen, flows] = await Promise.all([
    getUniverse(),
    liveGet<{ rows: ScreenRow[] }>("/v1/screener/rows", { revalidate: 60 }),
    liveGet<{ days: FlowDay[] }>("/v1/market/flows?days=20", { revalidate: 300 }),
  ])
  const sparks = new Map(universe?.instruments.map((r) => [r.id, r.spark]))
  const sparkOf = (id: number) => sparks.get(id) ?? (getInstrument(id) ? dailyCandles(getInstrument(id)!, 30).map((c) => c.close) : [])
  const stockSparks = new Map(directoryStocks(universe).map((s) => [s.id, s.spark]))

  const rows: MarketRow[] = (screen?.rows.length ? screen.rows : screenerSnapshot()).flatMap((r) => {
    const inst = getInstrument(r.id)
    if (!inst?.sector) return []
    const spark = stockSparks.get(r.id)
    return [
      {
        id: r.id,
        sector: r.sector,
        size: r.size,
        mcapCr: r.mcapCr ?? marketCapCr(inst, inst.prevClose),
        sma50: r.sma50,
        sma200: r.sma200,
        high52: r.high52,
        low52: r.low52,
        week: spark && spark.length > 6 ? (spark.at(-1)! / spark.at(-6)! - 1) * 100 : null,
        month: r.return1m,
        year: r.return1y,
      },
    ]
  })
  const nifty500 = EQUITIES.map((e) => e.id)
  const nifty50 = universe?.members[INDEX.NIFTY] ?? membersOf(INDEX.NIFTY).map((e) => e.id)

  const date = new Intl.DateTimeFormat("en-IN", { weekday: "long", day: "numeric", month: "long", timeZone: "Asia/Kolkata" }).format(new Date())

  return (
    <div className="page pt-6 pb-10">
      <PageHead title="Markets" lede={`${date} · the Nifty 500, its sectors and the money behind them`} />
      <div className="mt-5">
        <IndexCards cards={CARDS.map((c) => ({ ...c, spark: sparkOf(c.id) }))} />
      </div>
      <div className="mt-5 grid gap-5 lg:grid-cols-12">
        <Section id="map" className="lg:col-span-12" title="Market map" description="Every company a tile, sized by its market value and coloured by today's move. Point at one for detail; open it for the company.">
          <Heatmap members={{ nifty50, nifty500 }} />
        </Section>
        <Section className="lg:col-span-4" title="How broad the move is" description="Across the Nifty 500: how many rose and fell, how many sit above their 50- and 200-day averages (over half is a healthy market), and new highs against new lows.">
          <Breadth rows={rows} />
        </Section>
        <Section className="lg:col-span-8" title="Sectors over time" description="Each sector's move over four periods, weighted by company size, leaders today first.">
          <SectorReturns rows={rows} />
        </Section>
        <Section className="lg:col-span-12" title="Movers" description="Among the Nifty 500, as the prices come in. Busiest is today's volume against a usual day's.">
          <Movers ids={nifty500} />
        </Section>
        <Section className="lg:col-span-6" title="India VIX" description="The swing the options market expects over the next month: under 15 is calm, over 20 nervous.">
          <VixChart />
        </Section>
        <Section className="lg:col-span-6" title="Institutional money" description="Foreign portfolio investors against Indian mutual funds, insurers and banks: what each bought less what it sold in the cash market, from NSE's daily figures.">
          <Flows days={flows?.days ?? []} />
        </Section>
      </div>
    </div>
  )
}
