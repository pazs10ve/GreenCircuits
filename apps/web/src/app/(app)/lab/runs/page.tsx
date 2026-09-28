import type { Metadata } from "next"
import Link from "next/link"
import { FlaskConical } from "lucide-react"
import { PageHead } from "@/components/editorial/page-head"
import { Section } from "@/components/editorial/section"
import { YourTests } from "@/components/lab/your-tests"
import { Button } from "@/components/ui/button"

export const metadata: Metadata = {
  title: "Your tests",
  description: "The tests you have run in the lab, newest first.",
}

/** Every test the visitor has run, on a page of its own: the lab's "Your tests" tab. */
export default function RunsPage() {
  return (
    <div className="page pt-6 pb-10">
      <PageHead
        title="Your tests"
        lede="Kept with your account when you're signed in, and in this browser when you're not"
        actions={
          <Button asChild variant="brand">
            <Link href="/lab/new">
              <FlaskConical /> New test
            </Link>
          </Button>
        }
      />
      <Section className="mt-5" title="Newest first">
        <YourTests />
      </Section>
    </div>
  )
}
