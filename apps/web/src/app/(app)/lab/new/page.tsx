import type { Metadata } from "next"
import Link from "next/link"
import { Builder, BuilderFromRun } from "@/components/lab/builder"
import { draftFromDefinition, emptyDraft } from "@/lib/lab/draft"
import { fromTemplate } from "@/lib/lab/templates"

export const metadata: Metadata = {
  title: "New test",
  description: "Describe an investing idea and test it on the demo market's history.",
}

const param = (v: string | string[] | undefined) => (typeof v === "string" ? v : undefined)

export default async function NewTestPage({ searchParams }: PageProps<"/lab/new">) {
  const sp = await searchParams
  const runId = param(sp.run)
  const definition = fromTemplate(param(sp.template), param(sp.symbol))
  const initial = definition ? draftFromDefinition(definition) : emptyDraft()

  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-8 pb-20">
      <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
        <Link href="/lab" className="hover:text-ink">
          Lab
        </Link>
        <span className="mx-1.5" aria-hidden="true">
          /
        </span>
        New test
      </nav>
      <header className="mt-3 mb-10 max-w-[44rem]">
        <h1 className="font-serif text-[2.375rem] leading-[1.04] font-semibold tracking-[-0.02em] md:text-[3.25rem]">{runId ? "Change the rules" : "Describe your idea"}</h1>
        <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-2">
          Say what you&apos;d do, in the sentences below. The summary reads it back in plain words, so you can check it&apos;s what you meant before it runs.
        </p>
      </header>
      {runId ? <BuilderFromRun runId={runId} fallback={initial} /> : <Builder initial={initial} />}
    </div>
  )
}
