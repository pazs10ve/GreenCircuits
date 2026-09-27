import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="flex min-h-svh flex-col items-center justify-center gap-8 px-5 text-center">
      <Link href="/" aria-label="GreenCircuits, today's market">
        <Logo />
      </Link>
      <div className="max-w-[30rem] border-t border-ink pt-6">
        <p className="figure text-[4.5rem] leading-none text-down">404</p>
        <h1 className="mt-4 font-serif text-[1.75rem] leading-tight font-semibold tracking-[-0.02em]">This page hit its lower circuit</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-2">
          The link may be old, or the company may not be one this site follows. Search for it with Ctrl K, or start from today&apos;s market.
        </p>
      </div>
      <div className="flex gap-2">
        <Button asChild>
          <Link href="/">Today</Link>
        </Button>
        <Button asChild variant="outline">
          <Link href="/stocks">Stocks</Link>
        </Button>
      </div>
    </div>
  )
}
