"use client"

import { useState } from "react"
import Link from "next/link"
import type { PublicUser } from "@greencircuits/contracts/account"
import { passwordProblem } from "@greencircuits/contracts/account"
import { Section } from "@/components/editorial/section"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { Switch } from "@/components/ui/switch"
import { signOut, useAccountsAvailable, useChangePassword, useDeleteAccount, useMe, useSignOutElsewhere, useUpdateMe, reloadInto } from "@/lib/account/client"
import { useFeedPreferences } from "@/lib/feed/client"
import { usePreferences } from "@/lib/stores/preferences"
import { FeedPreferencesFields } from "./feed-preferences"

const input =
  "h-10 w-full max-w-sm rounded-md border border-rule bg-card px-3 text-[0.9375rem] outline-none transition-colors focus:border-ink-2 focus:ring-2 focus:ring-ring/25"

const since = (iso: string) => new Intl.DateTimeFormat("en-IN", { month: "long", year: "numeric", timeZone: "Asia/Kolkata" }).format(new Date(iso))

function Header({ me, live }: { me: PublicUser | undefined; live: boolean }) {
  if (live && me && !me.anonymous) {
    return (
      <header>
        <h1 className="font-serif text-[2.375rem] leading-[1.05] font-semibold tracking-[-0.02em] md:text-[3rem]">Your account</h1>
        <p className="mt-2 text-sm text-ink-2">
          {me.email} · with GreenCircuits since {since(me.createdAt)}
        </p>
      </header>
    )
  }
  return (
    <header className="max-w-[40rem]">
      <h1 className="font-serif text-[2.375rem] leading-[1.05] font-semibold tracking-[-0.02em] md:text-[3rem]">{live ? "Your data" : "Your settings"}</h1>
      <p className="mt-4 text-[1.0625rem] leading-relaxed text-ink-2">
        {live
          ? "You haven't signed up, so what you make is kept in an anonymous account tied to this browser. Create an account to keep it on every device; everything here comes with you."
          : "Accounts need the backend, which is off in this demo, so your watchlists, alerts, holdings, tests and settings are kept in this browser."}
      </p>
      {live && (
        <div className="mt-6 flex flex-wrap gap-2">
          <Button asChild>
            <Link href="/signup?next=/account">Create an account</Link>
          </Button>
          <Button asChild variant="outline">
            <Link href="/signin?next=/account">Sign in</Link>
          </Button>
        </div>
      )}
    </header>
  )
}

function FeedSection() {
  const { value, save, saving } = useFeedPreferences()
  const [saved, setSaved] = useState(false)
  return (
    <Section id="feed" title="Your feed" description="How the feed on Today is tuned. Changes are saved as you make them.">
      <FeedPreferencesFields
        value={value}
        onChange={(next) => {
          save(next)
          setSaved(true)
        }}
      />
      <p className="mt-4 h-5 text-sm text-ink-3" aria-live="polite">
        {saving ? "Saving…" : saved ? "Saved." : ""}
      </p>
    </Section>
  )
}

function ProfileSection({ me }: { me: PublicUser }) {
  const update = useUpdateMe()
  const [name, setName] = useState(me.name ?? "")
  return (
    <Section title="Profile">
      <form
        className="space-y-5"
        onSubmit={(e) => {
          e.preventDefault()
          update.mutate({ name: name.trim() })
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Name</span>
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} maxLength={60} autoComplete="name" />
        </label>
        <div>
          <span className="mb-1.5 block text-sm font-medium">Email</span>
          <p className="text-[0.9375rem] text-ink-2">{me.email}</p>
        </div>
        <div className="flex items-center gap-3">
          <Button type="submit" variant="outline" disabled={update.isPending || name.trim() === (me.name ?? "")}>
            Save
          </Button>
          <span className="text-sm text-ink-3" aria-live="polite">
            {update.isSuccess ? "Saved." : update.isError ? update.error.message : ""}
          </span>
        </div>
      </form>
    </Section>
  )
}

function PasswordSection({ email }: { email: string | null }) {
  const change = useChangePassword()
  const elsewhere = useSignOutElsewhere()
  const [current, setCurrent] = useState("")
  const [next, setNext] = useState("")
  const problem = next ? passwordProblem(next, email ?? undefined) : null
  return (
    <Section title="Password and sessions" description="Changing your password signs you out everywhere else.">
      <form
        className="space-y-5"
        onSubmit={async (e) => {
          e.preventDefault()
          if (problem) return
          const ok = await change.mutateAsync({ current, next }).then(() => true).catch(() => false)
          if (ok) {
            setCurrent("")
            setNext("")
          }
        }}
      >
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">Current password</span>
          <input className={input} type="password" value={current} onChange={(e) => setCurrent(e.target.value)} autoComplete="current-password" />
        </label>
        <label className="block">
          <span className="mb-1.5 block text-sm font-medium">New password</span>
          <input className={input} type="password" value={next} onChange={(e) => setNext(e.target.value)} autoComplete="new-password" aria-invalid={!!problem} />
          {problem && <span className="mt-1.5 block text-xs text-down">{problem}</span>}
        </label>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" variant="outline" disabled={change.isPending || !current || !next || !!problem}>
            Change password
          </Button>
          <span className="text-sm" aria-live="polite">
            {change.isSuccess ? <span className="text-ink-2">Changed. Your other sessions are signed out.</span> : change.isError ? <span className="text-down">{change.error.message}</span> : ""}
          </span>
        </div>
      </form>
      <div className="mt-8 flex flex-wrap items-center gap-3 border-t border-rule pt-6">
        <Button variant="outline" disabled={elsewhere.isPending} onClick={() => elsewhere.mutate()}>
          Sign out everywhere else
        </Button>
        <Button variant="ghost" onClick={() => void signOut()}>
          Sign out here
        </Button>
        <span className="text-sm text-ink-2" aria-live="polite">
          {elsewhere.isSuccess ? "Done: every other browser is signed out." : ""}
        </span>
      </div>
    </Section>
  )
}

function BrowserSection() {
  const flashPrices = usePreferences((s) => s.flashPrices)
  const alertSound = usePreferences((s) => s.alertSound)
  const set = usePreferences((s) => s.set)
  return (
    <Section title="This browser" description="Display settings, kept on this device only.">
      <div className="space-y-4 text-[0.9375rem]">
        <label className="flex cursor-pointer items-center gap-3">
          <Switch checked={flashPrices} onCheckedChange={(v) => set({ flashPrices: v })} aria-label="Flash prices when they change" />
          Flash prices when they change
        </label>
        <label className="flex cursor-pointer items-center gap-3">
          <Switch checked={alertSound} onCheckedChange={(v) => set({ alertSound: v })} aria-label="Play a sound when an alert goes off" />
          Play a sound when an alert goes off
        </label>
      </div>
    </Section>
  )
}

function DataSection({ me, live }: { me: PublicUser | undefined; live: boolean }) {
  const remove = useDeleteAccount()
  const [confirming, setConfirming] = useState(false)
  const [password, setPassword] = useState("")
  const account = live && me && !me.anonymous

  const clearBrowser = () => {
    for (const key of ["gc.alerts", "gc.portfolio", "gc.watchlists", "gc-lab-runs", "gc.preferences"]) {
      try {
        window.localStorage.removeItem(key)
      } catch {
        // Nothing stored.
      }
    }
    reloadInto("/")
  }

  return (
    <Section title="Your data" description={live ? "Everything is stored in Postgres, tied to your account; nothing is shared or sold." : undefined}>
      <div className="space-y-6 text-[0.9375rem]">
        {live && (
          <div>
            <a href="/api/v1/me/export" className="link font-medium">
              Download a copy
            </a>
            <p className="mt-1 text-sm text-ink-2">Your watchlists, alerts, holdings, strategies and notifications, as a JSON file.</p>
          </div>
        )}
        <div className="border-t border-rule pt-6">
          {!confirming ? (
            <Button variant="outline" className="text-down" onClick={() => setConfirming(true)}>
              {account ? "Delete your account" : live ? "Delete what's saved for this browser" : "Clear this browser's data"}
            </Button>
          ) : (
            <form
              className="max-w-md space-y-4 rounded-lg border border-down/30 bg-down-soft/40 p-4"
              onSubmit={async (e) => {
                e.preventDefault()
                if (!live) return clearBrowser()
                const ok = await remove.mutateAsync(account ? password : undefined).then(() => true).catch(() => false)
                if (ok) reloadInto("/")
              }}
            >
              <p className="text-ink">
                {account
                  ? "This deletes your account and everything in it, for good. It can't be undone."
                  : "This deletes the watchlists, alerts, holdings and tests saved for this browser. It can't be undone."}
              </p>
              {account && (
                <label className="block">
                  <span className="mb-1.5 block text-sm font-medium">Your password</span>
                  <input className={input} type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" required />
                </label>
              )}
              {remove.isError && <p className="text-sm text-down">{remove.error.message}</p>}
              <div className="flex gap-2">
                <Button type="submit" variant="destructive" disabled={remove.isPending || (account ? !password : false)}>
                  {account ? "Delete my account" : "Delete"}
                </Button>
                <Button type="button" variant="ghost" onClick={() => setConfirming(false)}>
                  Keep it
                </Button>
              </div>
            </form>
          )}
        </div>
      </div>
    </Section>
  )
}

export function AccountView() {
  const live = useAccountsAvailable()
  const { data: me, isPending } = useMe()
  if (live && isPending) {
    return (
      <div className="space-y-4" aria-busy="true">
        <Skeleton className="h-12 w-72" />
        <Skeleton className="h-5 w-96" />
      </div>
    )
  }
  const account = live && me && !me.anonymous ? me : null
  return (
    <div>
      <Header me={me} live={live} />
      <div className="mt-14 space-y-20">
        <FeedSection />
        {account && <ProfileSection me={account} />}
        {account && <PasswordSection email={account.email} />}
        <BrowserSection />
        <DataSection me={me} live={live} />
      </div>
    </div>
  )
}
