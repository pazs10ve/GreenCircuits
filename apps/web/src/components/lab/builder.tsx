"use client"

import { FlaskConical } from "lucide-react"
import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Button } from "@/components/ui/button"
import { Checkbox } from "@/components/ui/checkbox"
import { Switch } from "@/components/ui/switch"
import { getInstrument } from "@greencircuits/market/catalog"
import { alternativeKindFor, alternativeOf, describe } from "@/lib/lab/describe"
import { check, definitionOf, draftFromDefinition, named, type Draft, type Kind } from "@/lib/lab/draft"
import { useUniverse } from "@/lib/data/client"
import { useLabMode, useRun, useSubmitRun } from "@/lib/lab/client"
import { earliestStart } from "@/lib/lab/templates"
import { useMarket } from "@/lib/stream/market-context"
import { Tag } from "@/components/parts/tag"
import { cn } from "@/lib/utils"
import { ConditionList, UniversePicker } from "./conditions"
import { DateField, InstrumentField, MoneyField, NumberField, SelectField, sentence } from "./fields"

const shortDate = (date: string) =>
  /^\d{4}-\d{2}-\d{2}$/.test(date) ? new Intl.DateTimeFormat("en-IN", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" }).format(new Date(`${date}T00:00:00Z`)) : "…"

const KINDS: { kind: Kind; title: string; blurb: string }[] = [
  { kind: "sip", title: "Invest every month", blurb: "A SIP, which can wait for dips." },
  { kind: "rebalance", title: "Hold a fixed mix", blurb: "Equity and bonds, reset each April." },
  { kind: "rules", title: "Trade on rules", blurb: "Buy and sell when conditions are met." },
]

/** A step of the test as a numbered card: what to buy, when, with how much, over when. */
function Step({ n, title, children }: { n: number; title: string; children: React.ReactNode }) {
  return (
    <section aria-labelledby={`step-${n}`} className="grid grid-cols-[2rem_minmax(0,1fr)] gap-3 sm:gap-3.5">
      <span className="mt-4 flex size-8 items-center justify-center rounded-full bg-ink text-[13px] font-bold text-paper" aria-hidden="true">
        {n}
      </span>
      <div className="min-w-0 rounded-card border border-rule bg-paper p-4 sm:p-5">
        <h2 id={`step-${n}`} className="mb-4 text-sm font-semibold">
          {title}
        </h2>
        {children}
      </div>
    </section>
  )
}

function SubHead({ children }: { children: React.ReactNode }) {
  return <h3 className="mt-7 mb-2 text-sm font-semibold text-ink first:mt-0">{children}</h3>
}

function Toggle({ label, checked, onChange, children }: { label: string; checked: boolean; onChange: (v: boolean) => void; children: React.ReactNode }) {
  return (
    <div className={cn("flex flex-wrap items-center gap-x-2 text-[1.0625rem] leading-[2.75]", !checked && "text-ink-3")}>
      <Checkbox checked={checked} onCheckedChange={(v) => onChange(v === true)} aria-label={label} className="mr-1" />
      {children}
    </div>
  )
}

/** "Change the rules" of an earlier run: loads it, then hands over to the builder. */
export function BuilderFromRun({ runId, fallback }: { runId: string; fallback: Draft }) {
  const { data, isError } = useRun(runId)
  if (isError) return <Builder initial={fallback} />
  if (!data) return <p className="text-ink-2">Loading the test…</p>
  const r = data.run
  const draft = draftFromDefinition(r.definition, { from: r.date_from, to: r.date_to, capital: r.initial_capital, slippageBps: r.slippage_bps, name: r.name })
  return <Builder key={r.id} initial={draft} />
}

export function Builder({ initial }: { initial: Draft }) {
  const [draft, setDraft] = useState(initial)
  const update = (fn: (d: Draft) => Draft) => setDraft((d) => named(fn(d)))
  const setSip = (patch: Partial<Draft["sip"]>) => update((d) => ({ ...d, sip: { ...d.sip, ...patch } }))
  const setMix = (patch: Partial<Draft["rebalance"]>) => update((d) => ({ ...d, rebalance: { ...d.rebalance, ...patch } }))
  const setRules = (patch: Partial<Draft["rules"]>) => update((d) => ({ ...d, rules: { ...d.rules, ...patch } }))
  const setExit = (patch: Partial<Draft["rules"]["exit"]>) => update((d) => ({ ...d, rules: { ...d.rules, exit: { ...d.rules.exit, ...patch } } }))

  const definition = useMemo(() => definitionOf(draft), [draft])
  const checked = useMemo(() => check(draft), [draft])
  const ids = useMemo(() => (definition.type === "rules" ? definition.universe : [definition.instrumentId]), [definition])
  // How far back prices go: the API knows in live mode; the demo generators keep ten years of indices and five of the rest.
  const { dataset } = useMarket()
  const universe = useUniverse()
  const earliest = useMemo(() => {
    const picked = ids.length ? ids : [1]
    const starts = picked.map((id) => universe.data?.byId.get(id)?.since)
    return starts.every(Boolean) ? starts.sort().at(-1)! : earliestStart(picked)
  }, [ids, universe.data])

  const mode = useLabMode()
  const submit = useSubmitRun()
  const router = useRouter()
  const run = async () => {
    if (!checked.ok) return
    const res = await submit.mutateAsync(checked.request).catch(() => null)
    if (res) router.push(`/lab/runs/${res.runId}`)
  }

  const r = draft.rules
  const x = r.exit

  return (
    <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_22rem]">
      <form
        id="lab-form"
        className="min-w-0 space-y-4"
        onSubmit={(e) => {
          e.preventDefault()
          void run()
        }}
      >
        <Step n={1} title="The idea">
          <fieldset>
            <legend className="sr-only">What kind of idea</legend>
            <div className="grid gap-3 sm:grid-cols-3">
              {KINDS.map((k) => (
                <label
                  key={k.kind}
                  className={cn(
                    "cursor-pointer rounded-panel border p-4 transition-colors has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-ring/30",
                    draft.kind === k.kind ? "border-ink bg-paper" : "border-transparent bg-panel hover:border-rule-strong",
                  )}
                >
                  <input type="radio" name="kind" value={k.kind} checked={draft.kind === k.kind} onChange={() => update((d) => ({ ...d, kind: k.kind }))} className="sr-only" />
                  <span className="block text-sm font-semibold">{k.title}</span>
                  <span className="mt-1 block text-[13px] leading-snug text-ink-2">{k.blurb}</span>
                </label>
              ))}
            </div>
          </fieldset>
        </Step>

        {draft.kind === "sip" && (
          <Step n={2} title="The plan">
            <p className={sentence}>
              Invest <MoneyField label="Monthly amount" value={draft.sip.monthly} onChange={(monthly) => setSip({ monthly })} /> on the first trading day of every month in{" "}
              <InstrumentField label="Invest in" value={draft.sip.instrumentId} onChange={(instrumentId) => setSip({ instrumentId })} />.
            </p>
            <label className="mt-4 flex cursor-pointer items-center gap-3 text-[0.9375rem]">
              <Switch checked={draft.sip.waitForDip} onCheckedChange={(waitForDip) => setSip({ waitForDip })} aria-label="Wait for a dip" />
              Wait for a dip instead of buying straight away
            </label>
            {draft.sip.waitForDip && (
              <p className={cn(sentence, "mt-2")}>
                Keep each instalment in cash earning <NumberField label="Interest on cash" value={draft.sip.cashRatePct} suffix="%" decimals={1} onChange={(cashRatePct) => setSip({ cashRatePct })} /> a
                year until it closes <NumberField label="Fall to wait for" value={draft.sip.fallPct} suffix="%" onChange={(fallPct) => setSip({ fallPct })} /> below its 52-week high, then
                invest everything saved.
              </p>
            )}
          </Step>
        )}

        {draft.kind === "rebalance" && (
          <Step n={2} title="The mix">
            <p className={sentence}>
              Start with <MoneyField label="Starting money" value={draft.capital} onChange={(capital) => update((d) => ({ ...d, capital }))} />. Put{" "}
              <NumberField label="Share in equity" value={draft.rebalance.equityPct} suffix="%" onChange={(equityPct) => setMix({ equityPct })} /> in{" "}
              <InstrumentField label="Equity" value={draft.rebalance.instrumentId} onChange={(instrumentId) => setMix({ instrumentId })} /> and the rest in bonds earning{" "}
              <NumberField label="Bond interest" value={draft.rebalance.bondRatePct} suffix="%" decimals={1} onChange={(bondRatePct) => setMix({ bondRatePct })} /> a year.
            </p>
            <p className="mt-2 text-sm text-ink-2">
              Every April, money moves between the two to get back to {draft.rebalance.equityPct}/{Math.max(0, 100 - draft.rebalance.equityPct)}.
            </p>
          </Step>
        )}

        {draft.kind === "rules" && (
          <Step n={2} title="The rules">
            <SubHead>What to trade</SubHead>
            <UniversePicker ids={r.universe} onChange={(universe) => setRules({ universe, maxPositions: Math.min(Math.max(r.maxPositions, 1), Math.max(universe.length, 1)) })} />

            <SubHead>When to buy</SubHead>
            <p className="mb-3 text-[0.9375rem] text-ink-2">
              Buy when{" "}
              <SelectField
                label="Which conditions"
                value={r.entryLogic}
                options={[
                  { value: "ALL", label: "all" },
                  { value: "ANY", label: "any" },
                ]}
                onChange={(entryLogic) => setRules({ entryLogic })}
              />{" "}
              of these are true on a day&apos;s close. The order fills at the next day&apos;s open.
            </p>
            <ConditionList conditions={r.entry} onChange={(entry) => setRules({ entry })} />

            <SubHead>When to sell</SubHead>
            <p className="mb-1 text-[0.9375rem] text-ink-2">Sell when any of these happens:</p>
            <Toggle label="Sell at a target" checked={x.target.on} onChange={(on) => setExit({ target: { ...x.target, on } })}>
              it&apos;s <NumberField label="Target" value={x.target.value} suffix="%" onChange={(value) => setExit({ target: { on: true, value } })} /> above the buying price
            </Toggle>
            <Toggle label="Sell at a stop loss" checked={x.stop.on} onChange={(on) => setExit({ stop: { ...x.stop, on } })}>
              it&apos;s <NumberField label="Stop loss" value={x.stop.value} suffix="%" onChange={(value) => setExit({ stop: { on: true, value } })} /> below the buying price
            </Toggle>
            <Toggle label="Sell at a trailing stop" checked={x.trail.on} onChange={(on) => setExit({ trail: { ...x.trail, on } })}>
              it falls <NumberField label="Trailing stop" value={x.trail.value} suffix="%" onChange={(value) => setExit({ trail: { on: true, value } })} /> from its highest close since
              buying
            </Toggle>
            <Toggle label="Sell after a number of days" checked={x.time.on} onChange={(on) => setExit({ time: { ...x.time, on } })}>
              <NumberField label="Trading days" value={x.time.value} onChange={(value) => setExit({ time: { on: true, value } })} /> trading days have passed
            </Toggle>
            <Toggle label="Sell when a condition is met" checked={x.when.on} onChange={(on) => setExit({ when: { ...x.when, on } })}>
              a condition is met
            </Toggle>
            {x.when.on && (
              <div className="mt-1 mb-2 pl-8">
                <ConditionList conditions={x.when.conditions} onChange={(conditions) => setExit({ when: { on: true, conditions } })} />
              </div>
            )}

            <SubHead>Money and costs</SubHead>
            <p className={sentence}>
              Start with <MoneyField label="Starting money" value={draft.capital} onChange={(capital) => update((d) => ({ ...d, capital }))} />
              {r.universe.length > 1 ? (
                <>
                  {" "}
                  and hold up to <NumberField label="Positions at a time" value={r.maxPositions} onChange={(maxPositions) => setRules({ maxPositions })} /> at a time, splitting
                  the cash equally.
                </>
              ) : (
                "."
              )}{" "}
              Cash waiting to be used earns <NumberField label="Interest on cash" value={r.cashRatePct} suffix="%" decimals={1} onChange={(cashRatePct) => setRules({ cashRatePct })} /> a
              year.
            </p>
            <label className="mt-2 flex cursor-pointer items-start gap-3 text-[0.9375rem]">
              <Checkbox checked={r.costs} onCheckedChange={(v) => setRules({ costs: v === true })} className="mt-1" aria-label="Pay delivery charges" />
              <span>
                Pay Indian delivery charges on every trade: STT, stamp duty, exchange and SEBI fees, GST and depository charges.
              </span>
            </label>
            <p className={cn(sentence, "mt-1 text-[0.9375rem] text-ink-2")}>
              Assume each order fills <NumberField label="Slippage in basis points" value={draft.slippageBps} suffix="bps" decimals={1} onChange={(slippageBps) => update((d) => ({ ...d, slippageBps }))} /> worse
              than the open.
            </p>
          </Step>
        )}

        <Step n={3} title="When to test it">
          <p className={sentence}>
            From <DateField label="Start date" value={draft.from} min={earliest} max={draft.to} onChange={(from) => update((d) => ({ ...d, from }))} /> to{" "}
            <DateField label="End date" value={draft.to} min={draft.from} onChange={(to) => update((d) => ({ ...d, to }))} />.
          </p>
          <p className="mt-2 text-sm text-ink-2">
            {dataset === "real" ? "Real prices" : "The demo market’s history"} for {ids.length === 1 ? getInstrument(ids[0]!)?.name : "these"}{" "}
            {dataset === "real" ? "go" : "goes"} back to{" "}
            {new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "UTC" }).format(new Date(`${earliest}T00:00:00Z`))}.{" "}
            {draft.kind === "rules" && "Indicators need some history before the first signal, so give them a few months."}
          </p>
        </Step>

        <Step n={4} title="Name it">
          <input
            aria-label="Name"
            value={draft.name}
            maxLength={80}
            onChange={(e) => update((d) => ({ ...d, name: e.target.value, nameEdited: true }))}
            className="h-10 w-full max-w-md rounded-md border border-rule bg-card px-3 text-[0.9375rem] outline-none focus:border-ink-2 focus:ring-2 focus:ring-ring/25"
          />
        </Step>
      </form>

      <aside>
        <div className="space-y-4 rounded-card border border-rule bg-paper p-5 lg:sticky lg:top-20">
          <h2 className="text-sm font-semibold">In plain words</h2>
          <div className="space-y-3 font-serif text-[1.0625rem] leading-relaxed">
            {describe(definition, draft.kind === "sip" ? undefined : draft.capital).map((p, i) => (
              <p key={i}>{p}</p>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Tag>
              {shortDate(draft.from)} to {shortDate(draft.to)}
            </Tag>
            <Tag tone="bench">Against {alternativeOf(alternativeKindFor(definition), definition).label.toLowerCase()}</Tag>
          </div>
          {!checked.ok && (
            <ul className="space-y-1 text-sm text-down" aria-live="polite">
              {checked.issues.map((issue) => (
                <li key={issue}>{issue}</li>
              ))}
            </ul>
          )}
          <Button type="submit" form="lab-form" size="lg" variant="brand" className="w-full" disabled={!checked.ok || submit.isPending}>
            <FlaskConical />
            {submit.isPending ? (mode === "browser" ? "Running…" : "Sending…") : "Run the test"}
          </Button>
          {submit.isError && <p className="text-sm text-down">{submit.error.message}</p>}
          <p className="text-xs leading-relaxed text-ink-3">
            {mode === "server"
              ? `It runs on the server with the Python engine, usually in a few seconds. ${dataset === "real" ? "Prices are real daily closes." : "Prices are the demo market's, not real history."}`
              : "It runs here in your browser, with a TypeScript copy of the server's engine that's tested to give the same results. Prices are the demo market's, not real history."}
          </p>
        </div>
      </aside>
    </div>
  )
}
