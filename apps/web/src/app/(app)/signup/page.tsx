import type { Metadata } from "next"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Create an account", robots: { index: false } }

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams
  return (
    <div className="mx-auto max-w-[26rem] px-5 pt-12 pb-20 md:pt-20">
      <h1 className="font-serif text-[2.25rem] leading-tight font-semibold tracking-[-0.02em]">Create an account</h1>
      <p className="mt-3 mb-8 text-[0.9375rem] leading-relaxed text-ink-2">
        An account keeps your watchlists, alerts, holdings and tests on every device you use, and tunes your feed to how you invest. What you&apos;ve already made in this browser comes with you.
      </p>
      <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} />
    </div>
  )
}
