import { BellPlus } from "lucide-react"
import { TestIdeaMenu } from "@/components/lab/test-idea-menu"
import { AlertDialogButton } from "@/components/market/alert-dialog"
import { WatchButton } from "@/components/market/watch-button"
import { Button } from "@/components/ui/button"

/**
 * An instrument's actions at a phone's foot, within thumb reach: watch, set
 * an alert, and test an idea on its prices. They take the tab bar's place
 * while they're on the page (globals.css hides it).
 */
export function FootActions({ instrumentId, test }: { instrumentId: number; test: boolean }) {
  return (
    <div data-foot-actions className="fixed inset-x-0 bottom-0 z-40 border-t border-rule bg-paper/95 pb-[env(safe-area-inset-bottom)] backdrop-blur-md md:hidden">
      <div className="flex h-16 items-center gap-2 px-4">
        <WatchButton instrumentId={instrumentId} size="lg" iconOnly={test} className={test ? "size-11 shrink-0" : "h-11 flex-1"} />
        <AlertDialogButton
          instrumentId={instrumentId}
          trigger={
            <Button variant="outline" size="icon-lg" aria-label="Set an alert" className="size-11 shrink-0">
              <BellPlus />
            </Button>
          }
        />
        {test && <TestIdeaMenu instrumentId={instrumentId} size="lg" className="h-11 flex-1" />}
      </div>
    </div>
  )
}
