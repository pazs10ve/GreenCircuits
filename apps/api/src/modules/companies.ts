import { sql } from "kysely"
import { z } from "zod"
import type { Db } from "@greencircuits/db"
import { INDEX, getInstrument } from "@greencircuits/market/catalog"
import type { BalanceSheetRow, CashFlowRow, Fundamentals, PeriodRow, Shareholding } from "@greencircuits/market/fundamentals"
import { buildProfile, peHistoryFrom, sectorMediansFrom } from "@greencircuits/market/research/company"
import { sipAgainstIndex, sipVsDip } from "@greencircuits/market/research/experiments"
import type { FastifyPluginAsyncZod } from "fastify-type-provider-zod"
import { cached } from "../lib/cache"
import { lastDailyCandles } from "../lib/candles"
import { istToday, periodLabel, quarterLabelOf } from "../lib/dates"
import { instrumentSummary } from "./instruments"

const CRORE = 1e7

interface Group {
  label: string
  end: string
  v: Record<string, number>
}

/**
 * Everything a company page shows, assembled from the database: statements,
 * derived metrics, shareholding, valuation history, sector medians, peers,
 * upcoming events and the "would it have worked?" experiments. The five
 * pillars are computed by the same function the demo mode uses.
 */
export async function loadCompany(db: Db, slug: string) {
  const row = await db
    .selectFrom("ref.instrument as i")
    .innerJoin("ref.security as s", "s.id", "i.security_id")
    .innerJoin("ref.issuer as iss", "iss.id", "s.issuer_id")
    .leftJoin("ref.industry as ind", "ind.id", "iss.industry_id")
    .select([
      "i.id",
      "i.trading_symbol",
      "i.display_name",
      "i.kind",
      "i.segment",
      "i.exchange_code",
      "i.tick_size",
      "i.lot_size",
      "i.attrs",
      "s.id as security_id",
      "s.face_value",
      "iss.id as issuer_id",
      "iss.description",
      "ind.parent_id as sector_id",
    ])
    .where("i.kind", "=", "LISTING")
    .where(sql<string>`i.attrs->>'slug'`, "=", slug)
    .executeTakeFirst()
  if (!row) return null
  const instrument = instrumentSummary(row)
  const catalogInst = getInstrument(row.id)
  if (!catalogInst) return null

  const [values, metricRows, valuations, holdings, sectorRows, peerRows, events, candles, niftyCandles] = await Promise.all([
    db
      .selectFrom("corp.financial_statement as fs")
      .innerJoin("corp.financial_value as fv", "fv.statement_id", "fs.id")
      .select(["fs.statement", "fs.period_type", "fs.period_end", "fs.fiscal_year", "fs.fiscal_period", "fv.item_code", "fv.value"])
      .where("fs.issuer_id", "=", row.issuer_id)
      .where("fs.is_latest", "=", true)
      .where("fs.consolidated", "=", true)
      .orderBy("fs.period_end")
      .execute(),
    db.selectFrom("corp.metric_value").select(["metric_code", "value", "period_end"]).where("issuer_id", "=", row.issuer_id).orderBy("period_end").execute(),
    db.selectFrom("corp.valuation_daily").select(["trade_date", "pe_ttm"]).where("security_id", "=", row.security_id).orderBy("trade_date").execute(),
    db
      .selectFrom("corp.shareholding")
      .select(["period_end", "category", "holding_pct", "pledged_pct"])
      .where("security_id", "=", row.security_id)
      .orderBy("period_end")
      .execute(),
    db
      .selectFrom("scr.equity_snapshot as es")
      .innerJoin("ref.industry as ind", "ind.id", "es.industry_id")
      .select(["es.pe_ttm", "es.pb", "es.roe_pct", "es.debt_to_equity"])
      .where("ind.parent_id", "=", row.sector_id)
      .execute(),
    db
      .selectFrom("scr.equity_snapshot as es")
      .innerJoin("ref.industry as ind", "ind.id", "es.industry_id")
      .innerJoin("ref.instrument as i", "i.id", "es.instrument_id")
      .select(["i.id", "i.display_name", sql<string>`i.attrs->>'slug'`.as("slug"), "es.mcap_cr", "es.pe_ttm", "es.roe_pct", "es.profit_cagr_3y_pct", "es.return_1y_pct"])
      .where("ind.parent_id", "=", row.sector_id)
      .orderBy("es.mcap_cr", "desc")
      .limit(6)
      .execute(),
    db
      .selectFrom("corp.event")
      .select(["event_type", "event_date", "purpose"])
      .where("issuer_id", "=", row.issuer_id)
      .where("event_date", ">=", istToday())
      .orderBy("event_date")
      .limit(5)
      .execute(),
    lastDailyCandles(db, row.id, 1260),
    lastDailyCandles(db, INDEX.NIFTY, 1260),
  ])
  if (candles.length === 0) return null

  // Statements: one group per (statement, period type, period end), values in rupees → crore.
  const groups = new Map<string, Group>()
  for (const r of values) {
    const key = `${r.statement}|${r.period_type}|${r.period_end}`
    const g = groups.get(key) ?? { label: periodLabel(r.fiscal_year, r.period_type === "Q" ? r.fiscal_period : null), end: r.period_end, v: {} }
    g.v[r.item_code] = r.value
    groups.set(key, g)
  }
  const pick = (statement: string, periodType: string) =>
    [...groups.entries()].filter(([k]) => k.startsWith(`${statement}|${periodType}|`)).map(([, g]) => g).sort((a, b) => a.end.localeCompare(b.end))
  const cr = (g: Group, code: string) => (g.v[code] ?? 0) / CRORE
  const period = (g: Group): PeriodRow => {
    const revenue = cr(g, "revenue")
    const operatingProfit = cr(g, "operating_profit")
    return {
      label: g.label,
      revenue,
      expenses: cr(g, "expenses"),
      operatingProfit,
      opm: revenue ? (operatingProfit / revenue) * 100 : 0,
      otherIncome: cr(g, "other_income"),
      depreciation: cr(g, "depreciation"),
      interest: cr(g, "interest"),
      pbt: cr(g, "pbt"),
      tax: cr(g, "tax"),
      netProfit: cr(g, "pat"),
      eps: g.v.eps ?? 0,
    }
  }
  const annual = pick("PL", "FY").map(period)
  const quarters = pick("PL", "Q").map(period)
  const balanceSheet: BalanceSheetRow[] = pick("BS", "FY").map((g) => ({
    label: g.label,
    equityCapital: cr(g, "equity_capital"),
    reserves: cr(g, "reserves"),
    borrowings: cr(g, "borrowings"),
    otherLiabilities: cr(g, "other_liabilities"),
    total: cr(g, "total_assets"),
    fixedAssets: cr(g, "fixed_assets"),
    cwip: cr(g, "cwip"),
    investments: cr(g, "investments"),
    otherAssets: cr(g, "other_assets"),
  }))
  const cashFlow: CashFlowRow[] = pick("CF", "FY").map((g) => ({
    label: g.label,
    operating: cr(g, "cfo"),
    investing: cr(g, "cfi"),
    financing: cr(g, "cff"),
    net: cr(g, "net_cash_flow"),
  }))

  const metric = (code: string): number | null => metricRows.filter((m) => m.metric_code === code).at(-1)?.value ?? null

  const byQuarter = new Map<string, Shareholding>()
  for (const h of holdings) {
    const s = byQuarter.get(h.period_end) ?? { label: quarterLabelOf(h.period_end), promoter: 0, fpi: 0, dii: 0, government: 0, retail: 0, pledged: 0 }
    const pct = h.holding_pct
    if (h.category === "PROMOTER") {
      s.promoter += pct
      s.pledged = h.pledged_pct ?? 0
    } else if (h.category === "FPI") s.fpi += pct
    else if (h.category.startsWith("DII")) s.dii += pct
    else if (h.category === "GOVERNMENT") s.government += pct
    else s.retail += pct
    byQuarter.set(h.period_end, s)
  }
  const shareholding = [...byQuarter.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, s]) => s)

  const lastClose = candles.at(-1)!.close
  const ttm = quarters.slice(-4)
  const epsTtm = metric("eps_ttm") ?? ttm.reduce((s, q) => s + q.eps, 0)
  const bookValue = metric("book_value_per_share") ?? 0
  const lender = instrument.sector === "Financials"
  const f: Fundamentals = {
    symbol: instrument.symbol,
    about: row.description ?? "",
    faceValue: row.face_value ?? 10,
    bookValue,
    ttmRevenue: ttm.reduce((s, q) => s + q.revenue, 0),
    ttmProfit: ttm.reduce((s, q) => s + q.netProfit, 0),
    epsTtm,
    pe: epsTtm > 0 ? lastClose / epsTtm : 0,
    pb: bookValue > 0 ? lastClose / bookValue : 0,
    roe: metric("roe_pct") ?? 0,
    roce: metric("roce_pct") ?? 0,
    opm: metric("opm_pct") ?? 0,
    npm: metric("npm_pct") ?? 0,
    debtEquity: lender ? null : metric("debt_to_equity"),
    dividendYield: metric("div_yield_pct") ?? 0,
    salesCagr3y: metric("sales_cagr_3y_pct") ?? 0,
    profitCagr3y: metric("profit_cagr_3y_pct") ?? 0,
    quarters,
    annual,
    balanceSheet,
    cashFlow,
    shareholding,
  }

  const pes = valuations.filter((v) => v.pe_ttm != null && v.pe_ttm > 0)
  const years = pes.length ? (Date.parse(pes.at(-1)!.trade_date) - Date.parse(pes[0]!.trade_date)) / (365.25 * 86400000) : 0
  const pe = peHistoryFrom(pes.map((v) => v.pe_ttm!), f.pe, years)
  const sector = sectorMediansFrom(sectorRows.map((r) => ({ pe: r.pe_ttm, pb: r.pb, roe: r.roe_pct, debtEquity: r.debt_to_equity })))
  const profile = buildProfile({ sector: catalogInst.sector }, f, pe, sector)

  return {
    instrument,
    profile,
    high52: Math.max(...candles.slice(-250).map((c) => c.high)),
    experiments: [
      sipAgainstIndex(catalogInst, { candles, indexCandles: niftyCandles }),
      sipVsDip(catalogInst, { years: 5, dip: 0.2, candles }),
    ],
    peers: peerRows.map((p) => ({
      id: p.id,
      slug: p.slug,
      name: p.display_name,
      mcapCr: p.mcap_cr ?? 0,
      pe: p.pe_ttm ?? 0,
      roe: p.roe_pct ?? 0,
      growth: p.profit_cagr_3y_pct ?? 0,
      return1y: p.return_1y_pct ?? 0,
    })),
    events: events.map((e) => ({
      date: e.event_date,
      kind: e.event_type === "RESULTS" ? ("RESULTS" as const) : ("DIVIDEND" as const),
      title: `${instrument.symbol} ${e.event_type === "RESULTS" ? "results" : "record date"}`,
      detail: e.purpose ?? "",
      instrumentId: instrument.id,
    })),
  }
}

export type CompanyPayload = NonNullable<Awaited<ReturnType<typeof loadCompany>>>

export const companyRoutes: FastifyPluginAsyncZod = async (app) => {
  app.get(
    "/companies/:slug",
    {
      schema: {
        tags: ["companies"],
        summary: "A company page: fundamentals, valuation history, ownership, peers, events and experiments",
        params: z.object({ slug: z.string().regex(/^[a-z0-9-]{1,40}$/) }),
      },
    },
    async (req, reply) => {
      // Company data changes when the nightly loaders run, so five minutes of caching is safe.
      const data = await cached(app.valkey, `gc:company:${req.params.slug}:${istToday()}`, 300, () => loadCompany(app.db, req.params.slug))
      if (!data) return reply.code(404).send({ error: "not_found" })
      reply.header("cache-control", "public, max-age=60")
      return data
    },
  )
}
