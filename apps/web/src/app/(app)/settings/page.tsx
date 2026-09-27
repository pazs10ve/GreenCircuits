import { redirect } from "next/navigation"

/** Settings moved into the account page. */
export default function SettingsPage() {
  redirect("/account")
}
