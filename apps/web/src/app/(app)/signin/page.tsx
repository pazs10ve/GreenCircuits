import type { Metadata } from "next"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Sign in", robots: { index: false } }

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const { next } = await searchParams
  return (
    <div className="mx-auto max-w-[26rem] px-5 pt-12 pb-20 md:pt-20">
      <h1 className="font-serif text-[2.25rem] leading-tight font-semibold tracking-[-0.02em]">Sign in</h1>
      <p className="mt-3 mb-8 text-[0.9375rem] leading-relaxed text-ink-2">
        Your watchlists, alerts, holdings and tests are kept with your account. Anything you made in this browser before signing in joins them.
      </p>
      <AuthForm mode="signin" next={typeof next === "string" ? next : undefined} />
    </div>
  )
}
