import { z } from "zod"

/**
 * Strategy definitions: what the lab's builder produces, what the API
 * validates and stores in lab.strategy_version, and what the Python engine
 * runs. Daily bars; long only; signals on a bar's close, fills at the next open.
 */

export const Operand = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("price") }),
  z.object({ kind: z.enum(["sma", "ema", "rsi", "high", "low"]), period: z.number().int().min(2).max(400) }),
  z.object({ kind: z.literal("value"), value: z.number().finite() }),
])
export type Operand = z.infer<typeof Operand>

export const Condition = z.object({
  left: Operand,
  op: z.enum([">", "<", "crosses_above", "crosses_below"]),
  right: Operand,
})
export type Condition = z.infer<typeof Condition>

const Sip = z.object({
  type: z.literal("sip"),
  instrumentId: z.number().int().positive(),
  monthly: z.number().positive().max(10_000_000),
  /** Save the instalment instead, and invest it all once the price is this far below its 52-week high. */
  dip: z.object({ fallPct: z.number().min(1).max(60), cashRatePct: z.number().min(0).max(15) }).optional(),
})

const Rebalance = z.object({
  type: z.literal("rebalance"),
  instrumentId: z.number().int().positive(),
  equityPct: z.number().min(0).max(100),
  bondRatePct: z.number().min(0).max(15),
})

const Rules = z.object({
  type: z.literal("rules"),
  universe: z.array(z.number().int().positive()).min(1).max(50),
  entry: z.array(Condition).min(1).max(8),
  entryLogic: z.enum(["ALL", "ANY"]).default("ALL"),
  exit: z
    .object({
      stopPct: z.number().min(0.5).max(50).optional(),
      targetPct: z.number().min(0.5).max(500).optional(),
      trailPct: z.number().min(0.5).max(50).optional(),
      maxBars: z.number().int().min(1).max(1000).optional(),
      when: z.array(Condition).max(8).optional(),
    })
    .refine((e) => Object.values(e).some((v) => v != null), "A strategy needs at least one way to exit"),
  maxPositions: z.number().int().min(1).max(20).default(5),
  costs: z.enum(["DELIVERY", "NONE"]).default("DELIVERY"),
  /** Interest earned on idle cash, % a year. */
  cashRatePct: z.number().min(0).max(15).default(0),
})

export const StrategyDefinition = z.discriminatedUnion("type", [Sip, Rebalance, Rules])
export type StrategyDefinition = z.infer<typeof StrategyDefinition>

export const BacktestRequest = z
  .object({
    name: z.string().trim().min(1).max(80),
    description: z.string().trim().max(500).optional(),
    definition: StrategyDefinition,
    from: z.iso.date(),
    to: z.iso.date(),
    capital: z.number().min(10_000).max(1_000_000_000).default(1_000_000),
    slippageBps: z.number().min(0).max(100).default(5),
  })
  .refine((r) => r.from < r.to, { message: "The start date must be before the end date", path: ["to"] })
export type BacktestRequest = z.infer<typeof BacktestRequest>

/** Starting points the site links to ("Change the rules and run it yourself"). */
export const TEMPLATES = ["sip", "sip-vs-dip", "sip-vs-index", "rebalance", "rsi-dip", "trend", "breakout"] as const
export type Template = (typeof TEMPLATES)[number]

/** A template's definition for one instrument (or, for rules, a set of them). */
export function templateDefinition(template: string, instrumentId: number, universe: number[] = [instrumentId]): StrategyDefinition | null {
  const rules = (over: Partial<Extract<StrategyDefinition, { type: "rules" }>>): StrategyDefinition => ({
    type: "rules",
    universe: universe.slice(0, 50),
    entry: [],
    entryLogic: "ALL",
    exit: {},
    maxPositions: Math.min(5, universe.length),
    costs: "DELIVERY",
    cashRatePct: 6,
    ...over,
  })
  switch (template) {
    case "sip":
    case "sip-vs-index":
      return { type: "sip", instrumentId, monthly: 10_000 }
    case "sip-vs-dip":
      return { type: "sip", instrumentId, monthly: 10_000, dip: { fallPct: 10, cashRatePct: 6 } }
    case "rebalance":
      return { type: "rebalance", instrumentId, equityPct: 60, bondRatePct: 7 }
    case "rsi-dip":
      return rules({
        entry: [{ left: { kind: "rsi", period: 14 }, op: "crosses_below", right: { kind: "value", value: 30 } }],
        exit: { targetPct: 10, maxBars: 60 },
      })
    case "trend":
      // In the market while the price is above its 200-day average, out while it's below.
      return rules({
        entry: [{ left: { kind: "price" }, op: "crosses_above", right: { kind: "sma", period: 200 } }],
        exit: { when: [{ left: { kind: "price" }, op: "crosses_below", right: { kind: "sma", period: 200 } }] },
      })
    case "breakout":
      // Buy a close above the previous year's highest high; ride it with a trailing stop.
      return rules({
        entry: [{ left: { kind: "price" }, op: ">", right: { kind: "high", period: 250 } }],
        exit: { trailPct: 10 },
      })
    default:
      return null
  }
}
