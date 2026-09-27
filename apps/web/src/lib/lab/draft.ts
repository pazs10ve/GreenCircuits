import { BacktestRequest, type Condition, type StrategyDefinition } from "@greencircuits/contracts/strategy"
import { INDEX } from "@greencircuits/market/catalog"
import { defaultName } from "./describe"
import { LARGEST_TEN, defaultPeriod } from "./templates"

/**
 * The builder's state. It keeps every kind's settings at once, so switching
 * from rules to a SIP and back loses nothing, and exits are toggles with
 * their values kept while switched off.
 */

export type Kind = StrategyDefinition["type"]

interface Toggle {
  on: boolean
  value: number
}

export interface Draft {
  kind: Kind
  name: string
  /** Once the name is typed, it stops following the settings. */
  nameEdited: boolean
  from: string
  to: string
  /** Starting money for a mix or rules. */
  capital: number
  slippageBps: number
  sip: { instrumentId: number; monthly: number; waitForDip: boolean; fallPct: number; cashRatePct: number }
  rebalance: { instrumentId: number; equityPct: number; bondRatePct: number }
  rules: {
    universe: number[]
    entry: Condition[]
    entryLogic: "ALL" | "ANY"
    exit: { target: Toggle; stop: Toggle; trail: Toggle; time: Toggle; when: { on: boolean; conditions: Condition[] } }
    maxPositions: number
    costs: boolean
    cashRatePct: number
  }
}

export const RSI_DIP: Condition = { left: { kind: "rsi", period: 14 }, op: "crosses_below", right: { kind: "value", value: 30 } }
const BELOW_AVERAGE: Condition = { left: { kind: "price" }, op: "crosses_below", right: { kind: "sma", period: 200 } }

export function emptyDraft(today = new Date()): Draft {
  const draft: Draft = {
    kind: "sip",
    name: "",
    nameEdited: false,
    ...defaultPeriod([INDEX.NIFTY], today),
    capital: 10_00_000,
    slippageBps: 5,
    sip: { instrumentId: INDEX.NIFTY, monthly: 10_000, waitForDip: false, fallPct: 10, cashRatePct: 6 },
    rebalance: { instrumentId: INDEX.NIFTY, equityPct: 60, bondRatePct: 7 },
    rules: {
      universe: LARGEST_TEN.slice(0, 1),
      entry: [RSI_DIP],
      entryLogic: "ALL",
      exit: {
        target: { on: true, value: 10 },
        stop: { on: false, value: 8 },
        trail: { on: false, value: 10 },
        time: { on: true, value: 60 },
        when: { on: false, conditions: [BELOW_AVERAGE] },
      },
      maxPositions: 1,
      costs: true,
      cashRatePct: 6,
    },
  }
  return named(draft)
}

/** A draft that reproduces a definition, e.g. from a template or an earlier run. */
export function draftFromDefinition(
  d: StrategyDefinition,
  extra: { from?: string; to?: string; capital?: number; slippageBps?: number; name?: string } = {},
  today = new Date(),
): Draft {
  const base = emptyDraft(today)
  const ids = d.type === "rules" ? d.universe : [d.instrumentId]
  const draft: Draft = { ...base, kind: d.type, ...defaultPeriod(ids, today) }
  if (d.type === "sip") {
    draft.sip = {
      instrumentId: d.instrumentId,
      monthly: d.monthly,
      waitForDip: !!d.dip,
      fallPct: d.dip?.fallPct ?? base.sip.fallPct,
      cashRatePct: d.dip?.cashRatePct ?? base.sip.cashRatePct,
    }
  } else if (d.type === "rebalance") {
    draft.rebalance = { instrumentId: d.instrumentId, equityPct: d.equityPct, bondRatePct: d.bondRatePct }
  } else {
    const e = base.rules.exit
    draft.rules = {
      universe: d.universe,
      entry: d.entry,
      entryLogic: d.entryLogic,
      exit: {
        target: { on: d.exit.targetPct != null, value: d.exit.targetPct ?? e.target.value },
        stop: { on: d.exit.stopPct != null, value: d.exit.stopPct ?? e.stop.value },
        trail: { on: d.exit.trailPct != null, value: d.exit.trailPct ?? e.trail.value },
        time: { on: d.exit.maxBars != null, value: d.exit.maxBars ?? e.time.value },
        when: { on: !!d.exit.when?.length, conditions: d.exit.when?.length ? d.exit.when : e.when.conditions },
      },
      maxPositions: d.maxPositions,
      costs: d.costs === "DELIVERY",
      cashRatePct: d.cashRatePct,
    }
  }
  if (extra.from) draft.from = extra.from
  if (extra.to) draft.to = extra.to
  if (extra.capital) draft.capital = extra.capital
  if (extra.slippageBps != null) draft.slippageBps = extra.slippageBps
  if (extra.name) return { ...draft, name: extra.name, nameEdited: true }
  return named(draft)
}

export function definitionOf(draft: Draft): StrategyDefinition {
  switch (draft.kind) {
    case "sip": {
      const s = draft.sip
      return {
        type: "sip",
        instrumentId: s.instrumentId,
        monthly: s.monthly,
        ...(s.waitForDip ? { dip: { fallPct: s.fallPct, cashRatePct: s.cashRatePct } } : {}),
      }
    }
    case "rebalance":
      return { type: "rebalance", ...draft.rebalance }
    case "rules": {
      const r = draft.rules
      const x = r.exit
      return {
        type: "rules",
        universe: r.universe,
        entry: r.entry,
        entryLogic: r.entryLogic,
        exit: {
          ...(x.target.on ? { targetPct: x.target.value } : {}),
          ...(x.stop.on ? { stopPct: x.stop.value } : {}),
          ...(x.trail.on ? { trailPct: x.trail.value } : {}),
          ...(x.time.on ? { maxBars: Math.round(x.time.value) } : {}),
          ...(x.when.on && x.when.conditions.length ? { when: x.when.conditions } : {}),
        },
        maxPositions: Math.min(r.maxPositions, r.universe.length || 1),
        costs: r.costs ? "DELIVERY" : "NONE",
        cashRatePct: r.cashRatePct,
      }
    }
  }
}

/** Keeps the default name in step with the settings until someone types their own. */
export function named(draft: Draft): Draft {
  return draft.nameEdited ? draft : { ...draft, name: defaultName(definitionOf(draft)) }
}

const MESSAGES: [RegExp, string][] = [
  [/^name$/, "Give the test a name."],
  [/^to$/, "The test has to end after it starts."],
  [/^(from|to)/, "Pick the dates to test between."],
  [/^capital$/, "Starting money has to be between ₹10,000 and ₹100 crore."],
  [/^definition\.monthly$/, "The monthly amount has to be between ₹1 and ₹1 crore."],
  [/^definition\.universe$/, "Pick at least one stock or index to trade (at most 50)."],
  [/^definition\.entry$/, "Add at least one condition for buying (at most 8)."],
  [/^definition\.exit$/, "Choose at least one way to sell."],
  [/period$/, "Periods run from 2 to 400 days."],
  [/^definition\.dip\.fallPct$/, "The dip to wait for has to be between 1% and 60%."],
  [/^definition\.equityPct$/, "The equity share has to be between 0% and 100%."],
  [/Pct$/, "One of the percentages is out of range."],
]

export type Checked = { ok: true; request: BacktestRequest } | { ok: false; issues: string[] }

/** Validates with the same schema the API uses, in words a person can act on. */
export function check(draft: Draft): Checked {
  const parsed = BacktestRequest.safeParse({
    name: draft.name,
    definition: definitionOf(draft),
    from: draft.from,
    to: draft.to,
    capital: draft.kind === "sip" ? 10_00_000 : draft.capital,
    slippageBps: draft.slippageBps,
  })
  if (parsed.success) return { ok: true, request: parsed.data }
  const issues = new Set<string>()
  for (const issue of parsed.error.issues) {
    const path = issue.path.join(".")
    const match = MESSAGES.find(([re]) => re.test(path))
    issues.add(match ? match[1] : issue.message)
  }
  return { ok: false, issues: [...issues] }
}
