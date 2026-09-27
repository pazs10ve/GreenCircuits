import Link from "next/link"
import { Logo } from "@/components/brand/logo"
import { Button } from "@/components/ui/button"

export default function NotFound() {
  return (
    <div className="relative flex min-h-svh flex-col items-center justify-center gap-6 overflow-hidden px-4 text-center">
      <div
        aria-hidden="true"
        className="bg-circuit pointer-events-none absolute inset-0 [mask-image:radial-gradient(ellipse_at_center,black_10%,transparent_65%)]"
      />
      <Link href="/" className="relative" aria-label="GreenCircuits home">
        <Logo />
      </Link>
      <div className="relative space-y-2">
        <p className="num font-display text-7xl font-bold tracking-tight text-primary">404</p>
        <h1 className="font-display text-2xl font-bold">This page hit its lower circuit</h1>
        <p className="max-w-sm text-[13px] text-muted-foreground">
          The link may be old, or the symbol may not be in the demo universe. Try the search in the app with Ctrl K.
        </p>
      </div>
      <div className="relative flex gap-2">
        <Button asChild size="lg">
          <Link href="/markets">Go to markets</Link>
        </Button>
        <Button asChild variant="outline" size="lg">
          <Link href="/stocks">Browse stocks</Link>
        </Button>
      </div>
    </div>
  )
}
