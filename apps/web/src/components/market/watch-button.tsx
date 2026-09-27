"use client"

import Link from "next/link"
import { ListPlus, Star } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@/components/ui/button"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import { getInstrument } from "@greencircuits/market/catalog"
import { useWatchlists } from "@/lib/stores/watchlists"
import { cn } from "@/lib/utils"

/** "Watch" button with a menu of watchlists to add the instrument to or remove it from. */
export function WatchButton({
  instrumentId,
  size = "lg",
  iconOnly = false,
  className,
}: {
  instrumentId: number
  size?: "default" | "sm" | "lg"
  iconOnly?: boolean
  className?: string
}) {
  const lists = useWatchlists((s) => s.lists)
  const toggle = useWatchlists((s) => s.toggle)
  const create = useWatchlists((s) => s.create)
  const add = useWatchlists((s) => s.add)
  const watching = lists.some((l) => l.ids.includes(instrumentId))
  const symbol = getInstrument(instrumentId)?.symbol ?? "Instrument"

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size={iconOnly ? (size === "lg" ? "icon-lg" : size === "sm" ? "icon-sm" : "icon") : size}
          aria-label={iconOnly ? (watching ? "Edit watchlists" : "Add to watchlist") : undefined}
          className={className}
        >
          <Star className={cn(watching && "fill-primary text-primary")} />
          {!iconOnly && (watching ? "Watching" : "Watch")}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuLabel>Watchlists</DropdownMenuLabel>
        {lists.map((l) => {
          const checked = l.ids.includes(instrumentId)
          return (
            <DropdownMenuCheckboxItem
              key={l.id}
              checked={checked}
              onSelect={(e) => e.preventDefault()}
              onCheckedChange={() => {
                toggle(l.id, instrumentId)
                toast(checked ? `Removed ${symbol} from ${l.name}` : `Added ${symbol} to ${l.name}`)
              }}
            >
              <span className="truncate">{l.name}</span>
              <span className="num ml-auto text-[11px] text-muted-foreground">{l.ids.length}</span>
            </DropdownMenuCheckboxItem>
          )
        })}
        <DropdownMenuSeparator />
        <DropdownMenuItem
          onSelect={() => {
            const id = create(`${symbol} ideas`)
            add(id, instrumentId)
            toast(`Created “${symbol} ideas” with ${symbol}`)
          }}
        >
          <ListPlus /> New list with {symbol}
        </DropdownMenuItem>
        <DropdownMenuItem asChild>
          <Link href="/watchlists">
            <Star /> Manage watchlists
          </Link>
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  )
}
