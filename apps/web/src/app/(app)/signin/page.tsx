import type { Metadata } from "next"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Sign in", robots: { index: false } }

export default async function SignInPage({ searchParams }: PageProps<"/signin">) {
  const { next } = await searchParams
  return (
    <div className="mx-auto max-w-[26rem] px-4 pt-10 pb-20 md:pt-16">
      <h1 className="font-serif text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[1.875rem]">Sign in</h1>
      <p className="mt-1.5 mb-5 text-[13px] leading-relaxed text-ink-3">Your watchlists, alerts, holdings and tests, on every device. What you made in this browser joins them.</p>
      <div className="rounded-card border border-rule bg-paper p-5">
        <AuthForm mode="signin" next={typeof next === "string" ? next : undefined} />
      </div>
    </div>
  )
}
