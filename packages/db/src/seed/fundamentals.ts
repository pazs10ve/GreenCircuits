import { EQUITIES } from "@greencircuits/market/catalog"
import { getFundamentals, type PeriodRow } from "@greencircuits/market/fundamentals"
import { upcomingEvents } from "@greencircuits/market/reference"
import type { Db } from "../index"
import { ISSUER_ID_OFFSET } from "./reference"
import { insertMany, istDate } from "./util"

/**
 * Financial statements, derived metrics, shareholding and the events calendar.
 * Sample figures are in ₹ crore in the generators; the schema stores rupees.
 */

const CRORE = 1e7

const LINE_ITEMS = [
  { code: "revenue", statement: "PL", label: "Revenue from operations", order: 10 },
  { code: "expenses", statement: "PL", label: "Expenses", order: 20 },
  { code: "operating_profit", statement: "PL", label: "Operating profit", order: 30 },
  { code: "other_income", statement: "PL", label: "Other income", order: 40 },
  { code: "depreciation", statement: "PL", label: "Depreciation", order: 50 },
  { code: "interest", statement: "PL", label: "Finance costs", order: 60 },
  { code: "pbt", statement: "PL", label: "Profit before tax", order: 70 },
  { code: "tax", statement: "PL", label: "Tax", order: 80 },
  { code: "pat", statement: "PL", label: "Net profit", order: 90 },
  { code: "eps", statement: "PL", label: "Earnings per share", order: 100, unit: "INR_PER_SHARE" },
  { code: "equity_capital", statement: "BS", label: "Equity capital", order: 10 },
  { code: "reserves", statement: "BS", label: "Reserves", order: 20 },
  { code: "borrowings", statement: "BS", label: "Borrowings", order: 30 },
  { code: "other_liabilities", statement: "BS", label: "Other liabilities", order: 40 },
  { code: "total_liabilities", statement: "BS", label: "Total liabilities", order: 50 },
  { code: "fixed_assets", statement: "BS", label: "Fixed assets", order: 60 },
  { code: "cwip", statement: "BS", label: "Capital work in progress", order: 70 },
  { code: "investments", statement: "BS", label: "Investments", order: 80 },
  { code: "other_assets", statement: "BS", label: "Other assets", order: 90 },
  { code: "total_assets", statement: "BS", label: "Total assets", order: 100 },
  { code: "cfo", statement: "CF", label: "Cash from operations", order: 10 },
  { code: "cfi", statement: "CF", label: "Cash from investing", order: 20 },
  { code: "cff", statement: "CF", label: "Cash from financing", order: 30 },
  { code: "net_cash_flow", statement: "CF", label: "Net cash flow", order: 40 },
] as const

/** 'FY26' → 2026-03-31; 'Q2 FY25' → FY2025 Q2 (Jul–Sep 2024) → 2024-09-30. */
function periodOf(label: string): { end: string; fy: number; q: number | null } {
  const fy = 2000 + Number(label.slice(-2))
  if (label.startsWith("FY")) return { end: `${fy}-03-31`, fy, q: null }
  const q = Number(label[1])
  const ends = ["", `${fy - 1}-06-30`, `${fy - 1}-09-30`, `${fy - 1}-12-31`, `${fy}-03-31`]
  return { end: ends[q]!, fy, q }
}

const PL: [string, keyof PeriodRow, number][] = [
  ["revenue", "revenue", CRORE],
  ["expenses", "expenses", CRORE],
  ["operating_profit", "operatingProfit", CRORE],
  ["other_income", "otherIncome", CRORE],
  ["depreciation", "depreciation", CRORE],
  ["interest", "interest", CRORE],
  ["pbt", "pbt", CRORE],
  ["tax", "tax", CRORE],
  ["pat", "netProfit", CRORE],
  ["eps", "eps", 1],
]

export async function seedFundamentals(db: Db): Promise<Record<string, number>> {
  await db
    .insertInto("corp.line_item")
    .values(LINE_ITEMS.map((l) => ({ code: l.code, statement: l.statement, label: l.label, unit: "unit" in l ? l.unit : "INR", display_order: l.order })))
    .onConflict((oc) => oc.column("code").doUpdateSet((eb) => ({ label: eb.ref("excluded.label"), display_order: eb.ref("excluded.display_order") })))
    .execute()

  const issuerIds = EQUITIES.map((e) => ISSUER_ID_OFFSET + e.id)
  await db.deleteFrom("corp.financial_statement").where("issuer_id", "in", issuerIds).execute()
  await db.deleteFrom("corp.metric_value").where("issuer_id", "in", issuerIds).execute()
  await db.deleteFrom("corp.shareholding").where("security_id", "in", issuerIds).execute()
  await db.deleteFrom("corp.event").where("issuer_id", "in", issuerIds).execute()

  let statements = 0
  let values = 0
  const metrics: { issuer_id: number; metric_code: string; consolidated: boolean; period_type: "FY"; period_end: string; value: number | null }[] = []
  const shareholding: {
    security_id: number
    period_end: string
    category: string
    holding_pct: number
    pledged_pct: number | null
  }[] = []

  for (const inst of EQUITIES) {
    const f = getFundamentals(inst)
    const issuerId = ISSUER_ID_OFFSET + inst.id
    const statementRows: { key: string; statement: "PL" | "BS" | "CF"; period_type: "FY" | "Q"; label: string; values: [string, number][] }[] = [
      ...f.annual.map((r) => ({ key: `PL-${r.label}`, statement: "PL" as const, period_type: "FY" as const, label: r.label, values: PL.map(([code, k, mult]) => [code, (r[k] as number) * mult] as [string, number]) })),
      ...f.quarters.map((r) => ({ key: `PLQ-${r.label}`, statement: "PL" as const, period_type: "Q" as const, label: r.label, values: PL.map(([code, k, mult]) => [code, (r[k] as number) * mult] as [string, number]) })),
      ...f.balanceSheet.map((r) => ({
        key: `BS-${r.label}`,
        statement: "BS" as const,
        period_type: "FY" as const,
        label: r.label,
        values: [
          ["equity_capital", r.equityCapital],
          ["reserves", r.reserves],
          ["borrowings", r.borrowings],
          ["other_liabilities", r.otherLiabilities],
          ["total_liabilities", r.total],
          ["fixed_assets", r.fixedAssets],
          ["cwip", r.cwip],
          ["investments", r.investments],
          ["other_assets", r.otherAssets],
          ["total_assets", r.total],
        ].map(([c, v]) => [c as string, (v as number) * CRORE] as [string, number]),
      })),
      ...f.cashFlow.map((r) => ({
        key: `CF-${r.label}`,
        statement: "CF" as const,
        period_type: "FY" as const,
        label: r.label,
        values: [
          ["cfo", r.operating],
          ["cfi", r.investing],
          ["cff", r.financing],
          ["net_cash_flow", r.net],
        ].map(([c, v]) => [c as string, (v as number) * CRORE] as [string, number]),
      })),
    ]

    const inserted = await db
      .insertInto("corp.financial_statement")
      .values(
        statementRows.map((s) => {
          const p = periodOf(s.label)
          return {
            issuer_id: issuerId,
            statement: s.statement,
            consolidated: true,
            period_type: s.period_type,
            period_end: p.end,
            fiscal_year: p.fy,
            fiscal_period: s.period_type === "Q" ? p.q : null,
            audited: s.period_type === "FY",
            source: "SAMPLE",
            source_ref: `${inst.symbol}:${s.key}`,
          }
        }),
      )
      .returning(["id", "source_ref"])
      .execute()
    statements += inserted.length
    const idByRef = new Map(inserted.map((r) => [r.source_ref, r.id]))
    values += await insertMany(
      db,
      "corp.financial_value",
      statementRows.flatMap((s) => {
        const id = idByRef.get(`${inst.symbol}:${s.key}`)!
        return s.values.map(([item_code, value]) => ({ statement_id: id, item_code, value: Math.round(value * 100) / 100 }))
      }),
    )

    const fy = "2026-03-31"
    for (const [code, value] of [
      ["roe_pct", f.roe],
      ["roce_pct", f.roce],
      ["opm_pct", f.opm],
      ["npm_pct", f.npm],
      ["debt_to_equity", f.debtEquity],
      ["sales_cagr_3y_pct", f.salesCagr3y],
      ["profit_cagr_3y_pct", f.profitCagr3y],
      ["book_value_per_share", f.bookValue],
      ["eps_ttm", f.epsTtm],
      ["div_yield_pct", f.dividendYield],
    ] as const) {
      metrics.push({ issuer_id: issuerId, metric_code: code, consolidated: true, period_type: "FY", period_end: fy, value })
    }

    for (const s of f.shareholding) {
      const end = periodOf(s.label).end
      const cats: [string, number, number | null][] = [
        ["PROMOTER", s.promoter, s.promoter > 0 ? s.pledged : null],
        ["FPI", s.fpi, null],
        ["DII_MF", s.dii, null],
        ["GOVERNMENT", s.government, null],
        ["RETAIL", s.retail, null],
      ]
      for (const [category, pct, pledged] of cats) {
        shareholding.push({ security_id: issuerId, period_end: end, category, holding_pct: Math.round(pct * 1e4) / 1e4, pledged_pct: pledged })
      }
    }
  }

  await insertMany(db, "corp.metric_value", metrics)
  await insertMany(db, "corp.shareholding", shareholding)

  // Calendar: results and record dates for the demo companies.
  const events = upcomingEvents()
    .filter((e) => e.instrumentId != null && (e.kind === "RESULTS" || e.kind === "DIVIDEND"))
    .map((e) => ({
      issuer_id: ISSUER_ID_OFFSET + e.instrumentId!,
      event_type: e.kind === "RESULTS" ? "RESULTS" : "DIVIDEND_RECORD",
      event_date: istDate(e.date),
      purpose: e.detail,
    }))
  const unique = [...new Map(events.map((e) => [`${e.issuer_id}|${e.event_type}|${e.event_date}`, e])).values()]
  await insertMany(db, "corp.event", unique)

  return { statements, values, metrics: metrics.length, shareholding: shareholding.length, events: unique.length }
}
