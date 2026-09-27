import Link from "next/link"
import { ArrowRight, ArrowRightLeft, Combine, Crosshair, Layers, Sunrise, TrendingUp } from "lucide-react"
import { TEMPLATES } from "@/lib/lab/templates"
import { StyleBadge } from "../badges"

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  "golden-cross": Combine,
  supertrend: TrendingUp,
  "opening-range-breakout": Sunrise,
  "pairs-trade": ArrowRightLeft,
  "covered-call": Layers,
  "short-strangle": Crosshair,
}

/** Starting points that open the builder prefilled. */
export function TemplateGallery() {
  return (
    <ul className="grid gap-3 p-3 sm:grid-cols-2 xl:grid-cols-3">
      {TEMPLATES.map((t) => {
        const Icon = ICONS[t.id] ?? TrendingUp
        return (
          <li key={t.id} className="min-w-0">
            <Link
              href={`/lab/new?template=${t.id}`}
              className="group flex h-full flex-col gap-2 rounded-md border bg-background/40 p-3 transition-colors hover:border-primary/40 hover:bg-muted/40"
            >
              <div className="flex items-center gap-2">
                <span className="flex size-7 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground group-hover:text-primary">
                  <Icon className="size-3.5" />
                </span>
                <span className="min-w-0 flex-1 truncate text-[13px] font-semibold">{t.name}</span>
                <StyleBadge style={t.style} />
              </div>
              <p className="text-[11px] leading-4 text-muted-foreground">{t.summary}</p>
              <code className="scrollbar-thin block overflow-x-auto rounded-sm bg-muted/60 px-2 py-1 font-mono text-[10.5px] whitespace-nowrap text-foreground/90">
                {t.snippet}
              </code>
              <div className="mt-auto flex items-center justify-between pt-1 text-[11px] text-muted-foreground">
                <span>{t.meta}</span>
                <span className="inline-flex items-center gap-1 font-medium text-primary opacity-80 group-hover:opacity-100">
                  Use template <ArrowRight className="size-3" />
                </span>
              </div>
            </Link>
          </li>
        )
      })}
    </ul>
  )
}
