"use client"

import Link from "next/link"
import { ChevronDown, FlaskConical } from "lucide-react"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getInstrument } from "@greencircuits/market/catalog"
import { ideasFor } from "@/lib/lab/templates"

/** "Test an idea": the lab's questions put to this instrument, each opening the builder with its rules filled in. */
export function TestIdeaMenu({ instrumentId, size = "default", className }: { instrumentId: number; size?: "default" | "sm" | "lg"; className?: string }) {
  const inst = getInstrument(instrumentId)
  if (!inst) return null
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="brand" size={size} className={className}>
          <FlaskConical /> Test an idea <ChevronDown className="-mr-1 opacity-80" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="text-xs font-normal text-ink-3">Test on years of {inst.name}&apos;s prices</DropdownMenuLabel>
        {ideasFor(inst).map((idea) => (
          <DropdownMenuItem key={idea.template} asChild className="flex-col items-start gap-0.5 py-2">
            <Link href={idea.href}>
              <span className="font-medium">{idea.title}</span>
              <span className="text-[13px] leading-snug text-ink-2">{idea.blurb}</span>
            </Link>
          </DropdownMenuItem>
        ))}
        <DropdownMenuSeparator />
        <DropdownMenuItem asChild>
          <Link href="/lab/new">Start from a blank test</Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
