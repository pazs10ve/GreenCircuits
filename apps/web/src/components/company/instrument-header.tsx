import type { Route } from "next"
import Link from "next/link"
import { Fragment } from "react"
import { BellPlus } from "lucide-react"
import type { Instrument } from "@greencircuits/market/types"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { WatchButton } from "@/components/market/watch-button"
import { Monogram } from "@/components/parts/monogram"
import { Button } from "@/components/ui/button"
import { TestIdeaMenu } from "@/components/lab/test-idea-menu"
import { FootActions } from "./foot-actions"
import { PriceBlock } from "./price-block"

/**
 * The head of an instrument's page: where it sits, its monogram and name with
 * a few tags, and the live price with watch, alert and a test of an idea on it.
 * The same for a company, an index and a listed fund. On a phone the actions
 * sit at the screen's foot instead.
 */
export function InstrumentHeader({
  inst,
  tags,
  crumbs,
  test = false,
}: {
  inst: Instrument
  tags: React.ReactNode
  /** Defaults to Markets, then the company's sector. */
  crumbs?: { href: string; label: string }[]
  /** Whether it can be tested in the lab: a company, an index or an ETF. */
  test?: boolean
}) {
  // A company's monogram is its symbol; an index's, its number where it has one ("50" for the Nifty 50).
  const letters = inst.kind === "INDEX" ? inst.name.replace(/\D/g, "") || inst.symbol : inst.symbol
  const trail = crumbs ?? [{ href: "/markets", label: "Markets" }, ...(inst.sector ? [{ href: `/stocks?sector=${inst.sector.toLowerCase()}`, label: inst.sector }] : [])]
  return (
    <header className="flex flex-wrap items-center justify-between gap-x-10 gap-y-4">
      <div className="min-w-0">
        <nav aria-label="Breadcrumb" className="text-[13px] text-ink-3">
          {trail.map((c, i) => (
            <Fragment key={c.href}>
              {i > 0 && (
                <span className="mx-1.5" aria-hidden="true">
                  /
                </span>
              )}
              <Link href={c.href as Route} className="hover:text-ink">
                {c.label}
              </Link>
            </Fragment>
          ))}
        </nav>
        <div className="mt-2 flex items-center gap-3.5">
          <Monogram text={letters} size={48} />
          <div className="min-w-0">
            <h1 className="line-clamp-2 font-serif text-[1.625rem] leading-[1.1] font-semibold tracking-[-0.02em] text-balance sm:line-clamp-1 sm:text-[1.75rem] md:text-[1.875rem]">{inst.name}</h1>
            <div className="mt-1.5 flex flex-wrap gap-1.5">{tags}</div>
          </div>
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-x-7 gap-y-3">
        <PriceBlock id={inst.id} />
        <div className="hidden flex-wrap gap-2 md:flex">
          <WatchButton instrumentId={inst.id} size="default" />
          <AlertDialogButton
            instrumentId={inst.id}
            trigger={
              <Button variant="outline" size="icon" aria-label="Set an alert">
                <BellPlus />
              </Button>
            }
          />
          {test && <TestIdeaMenu instrumentId={inst.id} />}
        </div>
      </div>
      <FootActions instrumentId={inst.id} test={test} />
    </header>
  )
}
