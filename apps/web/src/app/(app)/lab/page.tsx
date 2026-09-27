import type { Metadata } from "next"
import Link from "next/link"
import { Section } from "@/components/editorial/section"
import { YourTests } from "@/components/lab/your-tests"
import { Button } from "@/components/ui/button"
import { getInstrument } from "@greencircuits/market/catalog"
import { getFeed } from "@/lib/data/market"
import { QUESTIONS } from "@/lib/lab/templates"

export const metadata: Metadata = {
  title: "Lab",
  description: "Test an investing idea on years of daily prices, with Indian charges, against a sensible alternative.",
}

export default async function LabPage() {
  const { dataset } = await getFeed()
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-8 pb-16 md:pt-12">
      <header className="max-w-[46rem]">
        <p className="text-[13px] text-ink-2">Lab</p>
        <h1 className="mt-3 font-serif text-[2.375rem] leading-[1.04] font-semibold tracking-[-0.02em] md:text-[3.25rem]">Test an idea before you risk money on it</h1>
        <p className="mt-5 font-serif text-[1.3125rem] leading-snug text-ink-2">
          Describe a way of investing: a monthly SIP, a mix of equity and bonds, or rules for when to buy and sell. The lab runs it over {dataset === "real" ? "up to ten years of real prices" : "years of the demo market"}, charges what an
          Indian investor would pay, and puts it next to the obvious alternative.
        </p>
        <Button asChild size="lg" className="mt-7">
          <Link href="/lab/new">Start a new test</Link>
        </Button>
      </header>

      <div className="mt-16 space-y-20">
        <Section title="Start from a question" description="Each opens in the builder with the settings filled in, ready to change.">
          <ul className="grid gap-x-10 gap-y-9 md:grid-cols-2 lg:grid-cols-3">
            {QUESTIONS.map((q) => {
              const inst = getInstrument(q.instrumentId)
              const href = `/lab/new?template=${q.template}${q.universe ? "" : `&symbol=${encodeURIComponent(inst?.symbol ?? "")}`}`
              return (
                <li key={q.template} className="border-t border-rule pt-4">
                  <Link href={href} className="group block">
                    <h3 className="font-serif text-[1.25rem] leading-snug font-semibold group-hover:underline group-hover:decoration-1 group-hover:underline-offset-4">{q.question}</h3>
                    <p className="mt-2 text-[0.9375rem] leading-relaxed text-ink-2">{q.blurb}</p>
                    <span className="link mt-3 inline-flex items-center gap-1 text-sm font-medium">
                      Test it <span aria-hidden="true">→</span>
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Section>

        <Section id="your-tests" title="Your tests" description="Kept for this browser; there's no sign-in.">
          <YourTests />
        </Section>

        <Section title="How the lab tests">
          <div className="grid max-w-5xl gap-x-12 gap-y-6 text-[0.9375rem] leading-relaxed text-ink-2 md:grid-cols-3">
            <p>
              <span className="font-semibold text-ink">No peeking.</span> Rules are read on a day&apos;s close and trades happen at the next day&apos;s open, so no decision uses a price
              it couldn&apos;t have known.
            </p>
            <p>
              <span className="font-semibold text-ink">Real costs.</span> Trades pay STT, stamp duty, exchange and SEBI fees, GST and depository charges, plus a little slippage.
            </p>
            <p>
              <span className="font-semibold text-ink">A fair comparison.</span> Every result sits next to its alternative, and the last 30% of the period is held out, to show
              whether an edge survives.
            </p>
          </div>
        </Section>
      </div>
    </div>
  )
}
