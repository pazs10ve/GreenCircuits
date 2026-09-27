import type { Metadata } from "next"
import { AccountView } from "@/components/account/account-view"

export const metadata: Metadata = { title: "Your account", robots: { index: false } }

export default function AccountPage() {
  return (
    <div className="mx-auto max-w-[1200px] px-5 pt-8 pb-20 md:pt-12">
      <AccountView />
    </div>
  )
}
