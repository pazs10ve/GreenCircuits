"use client"

import { useEffect } from "react"
import Link from "next/link"
import { RotateCcw } from "lucide-react"
import { Button } from "@/components/ui/button"

export default function AppError({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error)
  }, [error])

  return (
    <div className="page pt-16 pb-24">
      <div className="max-w-[36rem] rounded-card border border-rule bg-paper p-6">
        <h1 className="font-serif text-[2rem] leading-tight font-semibold tracking-[-0.02em]">Something went wrong on this page</h1>
        <p className="mt-3 text-[1.0625rem] leading-relaxed text-ink-2">
          The rest of the site still works. Try the page again, or go back to today&apos;s market.
        </p>
        {error.digest && <p className="num mt-2 text-sm text-ink-3">Reference {error.digest}</p>}
        <div className="mt-6 flex gap-2">
          <Button onClick={() => retry()}>
            <RotateCcw /> Try again
          </Button>
          <Button asChild variant="outline">
            <Link href="/">Today</Link>
          </Button>
        </div>
      </div>
    </div>
  )
}
