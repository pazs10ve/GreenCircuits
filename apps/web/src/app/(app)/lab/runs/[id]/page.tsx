import type { Metadata } from "next"
import { RunView } from "@/components/lab/run-view"

export const metadata: Metadata = {
  title: "Test results",
  robots: { index: false },
}

export default async function RunPage({ params }: PageProps<"/lab/runs/[id]">) {
  const { id } = await params
  return (
    <div className="page pt-4 pb-10 md:pt-8">
      <RunView id={id} />
    </div>
  )
}
