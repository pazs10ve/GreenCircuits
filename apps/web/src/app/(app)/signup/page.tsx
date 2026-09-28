import type { Metadata } from "next"
import { AuthForm } from "@/components/account/auth-form"

export const metadata: Metadata = { title: "Create an account", robots: { index: false } }

export default async function SignUpPage({ searchParams }: PageProps<"/signup">) {
  const { next } = await searchParams
  return (
    <div className="mx-auto max-w-[26rem] px-4 pt-10 pb-20 md:pt-16">
      <h1 className="font-serif text-[1.75rem] leading-[1.1] font-semibold tracking-[-0.02em] md:text-[1.875rem]">Create an account</h1>
      <p className="mt-1.5 mb-5 text-[13px] leading-relaxed text-ink-3">Keeps your watchlists, alerts, holdings and tests on every device. What you&apos;ve made in this browser comes with you.</p>
      <div className="rounded-card border border-rule bg-paper p-5">
        <AuthForm mode="signup" next={typeof next === "string" ? next : undefined} />
      </div>
    </div>
  )
}
