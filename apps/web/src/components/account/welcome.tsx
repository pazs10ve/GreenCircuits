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
      <h1 className="font-serif text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[1.875rem]">
        {me?.name ? `Welcome, ${me.name.split(" ")[0]}` : "Welcome"}
      </h1>
      <p className="mt-1.5 mb-5 max-w-[40rem] text-[13px] leading-relaxed text-ink-3">
        Your account is ready, with everything you&apos;d made in this browser. Say how you invest and the feed puts what matters to you first; you can change it any time.
      </p>
      <div className="rounded-card border border-rule bg-paper p-5">
        <FeedPreferencesFields value={prefs} onChange={setValue} />
      </div>
      <div className="mt-5 flex flex-wrap items-center gap-3">
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
