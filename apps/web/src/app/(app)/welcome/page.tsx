import type { Metadata } from "next"
import { Welcome } from "@/components/account/welcome"

export const metadata: Metadata = { title: "Welcome", robots: { index: false } }

export default async function WelcomePage({ searchParams }: PageProps<"/welcome">) {
  const { next } = await searchParams
  return (
    <div className="mx-auto max-w-[56rem] px-5 pt-12 pb-20 md:pt-16">
      <Welcome next={typeof next === "string" ? next : undefined} />
    </div>
  )
}
