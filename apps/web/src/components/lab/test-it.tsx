import Link from "next/link"
import { ChevronRight } from "lucide-react"
import { Section } from "@/components/editorial/section"
import type { Instrument } from "@greencircuits/market/types"
import { ideasFor } from "@/lib/lab/templates"

/**
 * Where reading turns into doing: the lab's questions put to this stock, index
 * or fund, each opening the builder with its rules filled in.
 */
export function TestIt({ inst, history, className }: { inst: Instrument; history: string; className?: string }) {
  return (
    <Section
      id="test-it"
      className={className}
      kicker="Before you buy"
      brand
      title={`Test an idea on ${inst.name}`}
      description={`Each runs on ${history}, pays the charges an Indian investor pays, and is set against the obvious alternative. You can change any rule before it runs.`}
    >
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {ideasFor(inst).map((idea) => (
          <li key={idea.template}>
            <Link href={idea.href} className="group flex h-full flex-col rounded-panel bg-panel p-4 transition-colors hover:bg-brand-soft">
              <span className="text-sm leading-snug font-semibold">{idea.title}</span>
              <span className="mt-1 text-[13px] leading-snug text-ink-2">{idea.blurb}</span>
              <span className="mt-auto inline-flex items-center gap-0.5 pt-3 text-[13px] font-semibold text-brand">
                Set it up
                <ChevronRight className="size-3.5 transition-transform group-hover:translate-x-0.5" aria-hidden="true" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Section>
  )
}
