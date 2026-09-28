import type { Metadata } from "next"
import Link from "next/link"
import { ChevronRight, FlaskConical } from "lucide-react"
import { ExperimentCard } from "@/components/editorial/experiment-card"
import { MoreLink, Section } from "@/components/editorial/section"
import { YourTests } from "@/components/lab/your-tests"
import { Button } from "@/components/ui/button"
import { getInstrument } from "@greencircuits/market/catalog"
import { getFeed, getTodayContext } from "@/lib/data/market"
import { QUESTIONS } from "@/lib/lab/templates"

export const metadata: Metadata = {
  title: "Lab",
  description: "Test an investing idea on years of daily prices, with Indian charges, against a sensible alternative.",
}

/** What makes an answer worth trusting, in a few words each. */
const PRINCIPLES = [
  { title: "No peeking", detail: "Rules read at a close, trades at the next open" },
  { title: "Real costs", detail: "STT, stamp duty, fees and GST on every trade" },
  { title: "A fair test", detail: "Against the obvious alternative, with 30% held out" },
]

/**
 * The lab's front page: the question it answers, with one finished test
 * beside it to show what an answer looks like, then the questions to start
 * from and the visitor's own tests.
 */
export default async function LabPage() {
  const [{ dataset }, { experiments }] = await Promise.all([getFeed(), getTodayContext()])
  const featured = experiments[0]
  return (
    <div className="page pt-6 pb-10">
      <div className="space-y-5">
        <section aria-label="The lab" className="rounded-card border border-rule bg-paper p-5 sm:p-8">
          <div className="grid items-center gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-12">
            <div>
              <p className="kicker text-brand">The lab</p>
              <h1 className="mt-2 font-serif text-[2.25rem] leading-[1.05] font-semibold tracking-[-0.02em] md:text-[2.75rem]">Would it have worked?</h1>
              <p className="mt-3 max-w-[34em] text-[15px] leading-relaxed text-ink-2">
                Test a way of investing on {dataset === "real" ? "up to ten years of real prices" : "years of the demo market"}, with Indian charges, against the obvious
                alternative.
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Button asChild size="lg" variant="brand">
                  <Link href="/lab/new">
                    <FlaskConical /> Start a new test
                  </Link>
                </Button>
                <Button asChild size="lg" variant="outline">
                  <Link href="#questions">Start from a question</Link>
                </Button>
              </div>
              <dl className="mt-7 grid gap-2 sm:grid-cols-3">
                {PRINCIPLES.map((p) => (
                  <div key={p.title} className="rounded-panel bg-panel p-3">
                    <dt className="text-sm font-semibold">{p.title}</dt>
                    <dd className="mt-0.5 text-xs leading-snug text-ink-3">{p.detail}</dd>
                  </div>
                ))}
              </dl>
            </div>
            {featured && <ExperimentCard experiment={featured} compact className="bg-brand-soft" />}
          </div>
        </section>

        <Section id="questions" title="Start from a question" description="Each opens in the builder with the settings filled in, ready to change.">
          <ul className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
            {QUESTIONS.map((q) => {
              const inst = getInstrument(q.instrumentId)
              const href = `/lab/new?template=${q.template}${q.universe ? "" : `&symbol=${encodeURIComponent(inst?.symbol ?? "")}`}`
              return (
                <li key={q.template}>
                  <Link href={href} className="group flex h-full flex-col rounded-panel bg-panel p-4 transition-colors hover:bg-brand-soft">
                    <h3 className="font-serif text-[1.0625rem] leading-snug font-semibold">{q.question}</h3>
                    <p className="mt-1.5 line-clamp-2 text-[13px] leading-snug text-ink-2">{q.blurb}</p>
                    <span className="mt-auto inline-flex items-center gap-0.5 pt-3 text-[13px] font-semibold text-brand">
                      Test it
                      <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </Section>

        <Section
          id="your-tests"
          title="Your tests"
          description="Kept with your account when you're signed in, and in this browser when you're not."
          action={<MoreLink href="/lab/runs">All</MoreLink>}
        >
          <YourTests />
        </Section>
      </div>
    </div>
  )
}
