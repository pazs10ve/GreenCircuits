"use client"

import { useState } from "react"
import Link from "next/link"
import { passwordProblem } from "@greencircuits/contracts/account"
import { Button } from "@/components/ui/button"
import { AccountError, safeNext, useAccountsAvailable, useSignIn, useSignUp, reloadInto } from "@/lib/account/client"
import { cn } from "@/lib/utils"

const input =
  "h-11 w-full rounded-md border border-rule bg-card px-3 text-[0.9375rem] outline-none transition-colors placeholder:text-ink-3 focus:border-ink-2 focus:ring-2 focus:ring-ring/25 aria-invalid:border-down"

function Field({ label, hint, children }: { label: string; hint?: React.ReactNode; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1.5 block text-sm font-medium">{label}</span>
      {children}
      {hint && <span className="mt-1.5 block text-xs leading-relaxed text-ink-3">{hint}</span>}
    </label>
  )
}

/** Sign in, or create an account. After signing in the page reloads, so everything re-syncs with the account. */
export function AuthForm({ mode, next }: { mode: "signin" | "signup"; next?: string }) {
  const available = useAccountsAvailable()
  const signIn = useSignIn()
  const signUp = useSignUp()
  const [email, setEmail] = useState("")
  const [password, setPassword] = useState("")
  const [name, setName] = useState("")
  const [show, setShow] = useState(false)
  const [touched, setTouched] = useState(false)

  const pending = signIn.isPending || signUp.isPending || signIn.isSuccess || signUp.isSuccess
  const error = (mode === "signin" ? signIn.error : signUp.error) as AccountError | null
  const weak = mode === "signup" && password ? passwordProblem(password, email) : null

  if (!available) {
    return (
      <div className="rounded-lg border border-rule bg-card p-5 text-[0.9375rem] leading-relaxed text-ink-2">
        <p>
          Accounts live on the backend, which is off in this demo. Everything you do here, from watchlists and alerts to your tests in the lab, is kept in this browser instead.
        </p>
        <Link href="/" className="link mt-3 inline-block font-medium">
          Back to today&apos;s market
        </Link>
      </div>
    )
  }

  const submit = async (e: React.FormEvent) => {
    e.preventDefault()
    setTouched(true)
    if (mode === "signup") {
      if (weak) return
      const ok = await signUp.mutateAsync({ email, password, name: name.trim() || undefined }).catch(() => null)
      if (ok) reloadInto(`/welcome${next ? `?next=${encodeURIComponent(safeNext(next))}` : ""}`)
    } else {
      const ok = await signIn.mutateAsync({ email, password }).catch(() => null)
      if (ok) reloadInto(safeNext(next))
    }
  }

  return (
    <form onSubmit={submit} className="space-y-5" noValidate>
      {mode === "signup" && (
        <Field label="Your name" hint="Optional. It's only used to greet you.">
          <input className={input} value={name} onChange={(e) => setName(e.target.value)} autoComplete="name" maxLength={60} />
        </Field>
      )}
      <Field label="Email">
        <input className={input} type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} autoComplete="email" required autoFocus />
      </Field>
      <Field
        label="Password"
        hint={mode === "signup" ? (touched && weak ? <span className="text-down">{weak}</span> : "At least 8 characters. A few words together is stronger than one clever word.") : undefined}
      >
        <span className="relative block">
          <input
            className={cn(input, "pr-16")}
            type={show ? "text" : "password"}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onBlur={() => setTouched(true)}
            autoComplete={mode === "signup" ? "new-password" : "current-password"}
            aria-invalid={touched && !!weak}
            required
          />
          <button type="button" onClick={() => setShow((v) => !v)} className="absolute top-1/2 right-2 -translate-y-1/2 rounded px-2 py-1 text-xs font-medium text-ink-2 hover:bg-surface hover:text-ink">
            {show ? "Hide" : "Show"}
          </button>
        </span>
      </Field>

      {error && (
        <p className="text-sm text-down" role="alert">
          {error.message}{" "}
          {error.code === "email_taken" && (
            <Link href={`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link font-medium">
              Sign in
            </Link>
          )}
        </p>
      )}

      <Button type="submit" size="lg" className="w-full" disabled={pending || !email || !password}>
        {pending ? (mode === "signup" ? "Creating your account…" : "Signing in…") : mode === "signup" ? "Create account" : "Sign in"}
      </Button>

      <p className="text-center text-sm text-ink-2">
        {mode === "signup" ? (
          <>
            Already have an account?{" "}
            <Link href={`/signin${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link font-medium">
              Sign in
            </Link>
          </>
        ) : (
          <>
            New here?{" "}
            <Link href={`/signup${next ? `?next=${encodeURIComponent(next)}` : ""}`} className="link font-medium">
              Create an account
            </Link>
          </>
        )}
      </p>
    </form>
  )
}
