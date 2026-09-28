"use client"

import { useState } from "react"
import { DEFAULT_PREFERENCES, type Preferences } from "@greencircuits/contracts/account"
import { Button } from "@/components/ui/button"
import { safeNext, useMe, useUpdateMe, reloadInto } from "@/lib/account/client"
import { FeedPreferencesFields } from "./feed-preferences"

/** Straight after signing up: one question to tune the feed. */
export function Welcome({ next }: { next?: string }) {
  const { data: me } = useMe()
  const update = useUpdateMe()
  const [value, setValue] = useState<Preferences | null>(null)
  const prefs = value ?? me?.preferences ?? DEFAULT_PREFERENCES
  const go = () => reloadInto(safeNext(next))

  return (
    <div>
      <h1 className="font-serif text-[1.875rem] leading-[1.08] font-semibold tracking-[-0.02em] md:text-[2.5rem]">
        {me?.name ? `Welcome, ${me.name.split(" ")[0]}` : "Welcome"}
      </h1>
      <p className="mt-3 mb-10 max-w-[36rem] text-[1.0625rem] leading-relaxed text-ink-2">
        Your account is ready, with everything you&apos;d made in this browser. Tell us how you invest, and your feed will put what matters to you first. You can change this any time.
      </p>
      <FeedPreferencesFields value={prefs} onChange={setValue} />
      <div className="mt-10 flex flex-wrap items-center gap-3">
        <Button size="lg" disabled={update.isPending} onClick={async () => (await update.mutateAsync({ preferences: prefs }).catch(() => null)) && go()}>
          {update.isPending ? "Saving…" : "Continue"}
        </Button>
        <Button variant="ghost" size="lg" onClick={go}>
          Skip for now
        </Button>
      </div>
      {update.isError && <p className="mt-3 text-sm text-down">{update.error.message}</p>}
    </div>
  )
}
