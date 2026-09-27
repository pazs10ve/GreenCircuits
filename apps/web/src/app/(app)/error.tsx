"use client"

import { useEffect } from "react"
import Link from "next/link"
import { AlertTriangle, RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="mx-auto flex max-w-md flex-col items-center gap-4 py-24 text-center">
      <span className="flex size-10 items-center justify-center rounded-full border border-down/40 bg-down-muted">
        <AlertTriangle className="size-4 text-down" />
      </span>
      <div className="space-y-1.5">
        <h1 className="font-display text-xl font-bold">Something broke on this page</h1>
        <p className="text-[13px] text-muted-foreground">
          The rest of the app still works. Try again, or head back to the markets overview.
          {error.digest && <span className="num mt-1 block text-[11px]">Reference {error.digest}</span>}
        </p>
      </div>
      <div className="flex gap-2">
        <Button onClick={() => retry()}>
          <RotateCcw /> Try again
        </Button>
        <Button asChild variant="outline">
          <Link href="/markets">Markets</Link>
        </Button>
      </div>
    </div>
  )
}
