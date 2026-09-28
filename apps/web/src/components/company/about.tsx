import Link from "next/link"
import { ArrowUpRight } from "lucide-react"
import { INDEX, getInstrument, hrefOf, sizeBand } from "@greencircuits/market/catalog"
import { formatCrore } from "@greencircuits/market/format"
import type { Instrument } from "@greencircuits/market/types"
import { Tag } from "@/components/parts/tag"

/** Sentences, split where a full stop after a lower-case word meets a capital ("Ltd. The company…" splits; "Pvt. Ltd. is" doesn't). */
function sentences(text: string): string[] {
  return text.split(/(?<=[a-z0-9)]{2}\.)\s+(?=[A-Z])/).filter(Boolean)
}

/**
 * What the company does, two sentences of it up front and the rest a click
 * away, beside the facts that place it: sector, size, the indices it's in.
 */
export function About({ inst, about, website, mcapCr }: { inst: Instrument; about: string; website?: string; mcapCr?: number }) {
  const all = sentences(about.trim())
  const lead = all.slice(0, 2).join(" ")
  const rest = all.slice(2).join(" ")
  const band = sizeBand(inst.indices)
  // Every company here is in the Nifty 500; the narrower indices say more.
  const indices = (inst.indices ?? []).filter((id) => id !== INDEX.NIFTY500).flatMap((id) => getInstrument(id) ?? [])
  const host = website?.replace(/^https?:\/\/(www\.)?/, "").replace(/\/$/, "")

  return (
    <div className="grid gap-x-10 gap-y-4 md:grid-cols-[minmax(0,7fr)_minmax(0,5fr)]">
      <div>
        <p className="max-w-[40em] font-serif text-[1.0625rem] leading-relaxed text-ink">{lead}</p>
        {rest && (
          <details className="group mt-2 max-w-[40em]">
            <summary className="w-fit cursor-pointer list-none text-[13px] font-semibold text-ink-2 hover:text-ink group-open:hidden">Read more</summary>
            <p className="text-sm leading-relaxed text-ink-2">{rest}</p>
          </details>
        )}
      </div>
      <div className="flex flex-wrap content-start items-center gap-1.5 md:justify-end">
        {inst.sector && (
          <Link href={`/stocks?sector=${inst.sector.toLowerCase()}`}>
            <Tag>
              {inst.sector}
              {inst.industry && ` · ${inst.industry}`}
            </Tag>
          </Link>
        )}
        {mcapCr != null && mcapCr > 0 && (
          <Tag>
            {formatCrore(mcapCr)}
            {band && ` · ${band.toLowerCase()} cap`}
          </Tag>
        )}
        {indices.map((i) => (
          <Link key={i.id} href={hrefOf(i)}>
            <Tag>{i.name}</Tag>
          </Link>
        ))}
        {website && host && (
          <a href={website} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-0.5 px-1 text-xs font-semibold text-ink-2 hover:text-ink">
            {host}
            <ArrowUpRight className="size-3.5" aria-hidden="true" />
          </a>
        )}
      </div>
    </div>
  )
}
