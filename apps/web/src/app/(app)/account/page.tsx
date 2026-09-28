import type { Metadata } from "next"
import { AccountView } from "@/components/account/account-view"

export const metadata: Metadata = { title: "Your account", robots: { index: false } }

export default function AccountPage() {
  return (
    <div className="page pt-6 pb-10">
      <AccountView />
    </div>
  )
}
