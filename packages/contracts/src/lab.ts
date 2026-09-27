import type { Dataset } from "./index"
import type { StrategyDefinition } from "./strategy"

/**
 * What a backtest produces, as the API returns it. The Python engine writes
 * these shapes into lab.backtest_result; the web app's report reads them.
 * Ratios are fractions (0.124 is 12.4%); money is in rupees; dates are IST.
 */

export type RunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CANCELLED"

/** Time-weighted figures, so a SIP's instalments never count as gains. */
export interface Summary {
  cagr: number
  volatility: number
  sharpe: number
  sortino: number
  max_drawdown: number
  calmar: number
}

/**
 * What a strategy is judged against:
 * plain_sip (for a SIP that waits for dips), sip_in_benchmark (for a SIP in a
 * stock), deposit (for a SIP in the index), all_equity (for an equity and bond
 * mix) and buy_and_hold (for trading rules).
 */
export type AlternativeKind = "plain_sip" | "sip_in_benchmark" | "deposit" | "all_equity" | "buy_and_hold"

export interface AlternativeMetrics extends Summary {
  kind: AlternativeKind
  final_value: number
  total_return: number
  xirr?: number
  in_sample: Summary
  out_of_sample: Summary
}

export interface RunMetrics extends Summary {
  final_value: number
  total_return: number
  effective_from: string
  in_sample: Summary
  out_of_sample: Summary
  alternative: AlternativeMetrics
  // SIPs
  invested?: number
  xirr?: number
  months?: number
  months_in_cash?: number
  buys?: number
  // Mixes
  rebalances?: number
  // Rules
  trades?: number
  win_rate?: number
  profit_factor?: number | null
  avg_hold_days?: number
  exposure?: number
  charges?: number
}

/** One point of the report's chart (at most 2,000 per run). */
export interface EquityPoint {
  /** Unix seconds, 00:00 UTC on the trading date. */
  t: number
  /** The strategy's account value. */
  v: number
  /** The alternative's account value. */
  a: number
  /** Fall from the previous peak, time-weighted: -0.12 is 12% below. */
  dd: number
  /** SIPs: money put in so far. */
  inv?: number
  /** Everything else: the benchmark on the same starting capital. */
  b?: number
}

export interface RunResult {
  metrics: RunMetrics
  oos_from: string
  equity_sample: EquityPoint[]
  monthly_returns: Record<string, number>
  benchmark: Summary & { instrument_id: number }
}

export type ExitReason = "SIGNAL" | "TARGET" | "STOP" | "TRAIL" | "TIME" | "END_OF_TEST"

export interface RunTrade {
  trade_no: number
  instrument_id: number
  side: "B" | "S"
  quantity: number
  entry_at: string
  entry_price: number
  exit_at: string | null
  exit_price: number | null
  charges: number
  pnl: number | null
  exit_reason: ExitReason | null
}

export interface RunInfo {
  id: string
  name: string
  strategy_version: number
  definition: StrategyDefinition
  status: RunStatus
  progress_pct: number | null
  queued_at: string
  started_at: string | null
  finished_at: string | null
  date_from: string
  date_to: string
  initial_capital: number
  slippage_bps: number
  error: string | null
  engine_version: string
  /** The last price date the run saw, and whether the prices were real: see dataVersionOf. */
  data_version: string
}

/**
 * A run's data version: "2026-09-25" for sample prices, "2026-09-25 real" for
 * real ones. It is part of the result cache key, so a result computed on
 * sample prices is never reused for real ones.
 */
export function dataVersionOf(lastDate: string, dataset: Dataset): string {
  return dataset === "real" ? `${lastDate} real` : lastDate
}

export function readDataVersion(version: string): { lastDate: string; dataset: Dataset } {
  const [lastDate = version, tag] = version.split(" ")
  return { lastDate, dataset: tag === "real" ? "real" : "sample" }
}

/** GET /v1/me/backtests/:id. While a run waits or runs there is no result yet. */
export interface RunDetail {
  run: RunInfo
  queuePosition?: number
  result?: RunResult | null
  trades?: RunTrade[]
}

/** One row of GET /v1/me/backtests. */
export type RunSummary = Pick<
  RunInfo,
  "id" | "name" | "strategy_version" | "definition" | "status" | "progress_pct" | "queued_at" | "started_at" | "finished_at" | "date_from" | "date_to" | "error"
> & { metrics: RunMetrics | null }
